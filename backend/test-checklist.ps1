$ErrorActionPreference = "Stop"

$script:passCount = 0
$script:failCount = 0

function Assert-IsNumeric($val, $name) {
    if ($null -eq $val -or $val.GetType().Name -ne "Int32") {
        throw "Assertion failed: $name is not a number. Got: $val"
    }
}

function Run-Test($Name, $ScriptBlock) {
    try {
        & $ScriptBlock
        $script:passCount++
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } catch {
        $script:failCount++
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       Error: $_" -ForegroundColor DarkRed
    }
}

Write-Host "Starting Backend Server for tests..."
$process = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow

try {
    Start-Sleep -Seconds 3
    $baseUrl = "http://localhost:5000/api"

    # 1. Register a new user
    Run-Test "Register a new user" {
        $body = @{ full_name="Test User"; username="tester"; email="test@example.com"; password="password"; confirm_password="password" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -ContentType "application/json" -Body $body
        if (-not $res.success) { throw "Failed to register" }
    }

    # 2. Log in as prasanna/password
    $token1 = ""
    Run-Test "Log in as prasanna/password" {
        $body = @{ identifier="prasanna"; password="password" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -ContentType "application/json" -Body $body
        $script:token1 = $res.data.token
        if (-not $script:token1) { throw "Failed to login or get token" }
    }
    $headers1 = @{ Authorization="Bearer $token1" }

    # 3. Fetch dashboard stats
    Run-Test "Fetch dashboard stats and assert fields" {
        $res = Invoke-RestMethod -Uri "$baseUrl/dashboard/stats" -Method Get -Headers $headers1
        $data = $res.data
        Assert-IsNumeric $data.totalProjects "totalProjects"
        Assert-IsNumeric $data.ownedProjects "ownedProjects"
        Assert-IsNumeric $data.collabProjects "collabProjects"
        Assert-IsNumeric $data.totalFiles "totalFiles"
        Assert-IsNumeric $data.openReviews "openReviews"
        Assert-IsNumeric $data.pendingTasks "pendingTasks"
    }

    # 4. Create a project
    $newProjectId = ""
    Run-Test "Create a project" {
        $body = @{ name="Test Project"; description="Desc"; visibility="public"; category="Python" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/projects" -Method Post -Headers $headers1 -ContentType "application/json" -Body $body
        $script:newProjectId = $res.data.id
        if (-not $script:newProjectId) { throw "No project ID returned" }
    }

    # 5. Invite a second seeded user (himesh, u2)
    $memberId = ""
    Run-Test "Invite a second seeded user (himesh)" {
        $body = @{ userId="u2" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members/invitations" -Method Post -Headers $headers1 -ContentType "application/json" -Body $body
        $script:memberId = $res.data.id
        if (-not $script:memberId) { throw "No member ID returned for invitation" }
    }

    # 6. Accept the invitation as that user
    $token2 = ""
    $headers2 = @{}
    Run-Test "Accept the invitation as that user" {
        $login = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -ContentType "application/json" -Body (@{ identifier="himesh"; password="password" } | ConvertTo-Json)
        $script:token2 = $login.data.token
        $script:headers2 = @{ Authorization="Bearer $token2" }
        
        $res = Invoke-RestMethod -Uri "$baseUrl/notifications/invitations/$memberId/accept" -Method Post -Headers $headers2 -ContentType "application/json"
        if (-not $res.success) { throw "Failed to accept invitation" }
    }

    # 7. Create a file, save code, save a new version
    $fileId = ""
    $v2Id = ""
    Run-Test "Create a file, save code, save a new version" {
        # Create file
        $fileBody = @{ file_name="main.py"; language="Python" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/files/project/$newProjectId" -Method Post -Headers $headers1 -ContentType "application/json" -Body $fileBody
        $script:fileId = $res.data.id

        # Save code (update)
        $updateBody = @{ current_code="print('v2')" } | ConvertTo-Json
        $resUpdate = Invoke-RestMethod -Uri "$baseUrl/files/$fileId" -Method Put -Headers $headers1 -ContentType "application/json" -Body $updateBody

        # Save new version
        $vBody = @{ code="print('v2')" } | ConvertTo-Json
        $resVer = Invoke-RestMethod -Uri "$baseUrl/files/$fileId/versions" -Method Post -Headers $headers1 -ContentType "application/json" -Body $vBody
        $script:v2Id = $resVer.data.id
    }

    # 8. Submit a review
    $reviewId = ""
    Run-Test "Submit a review" {
        $rBody = @{ file_id=$fileId; version_id=$v2Id; line_number=1; review_type="comment"; comment="Nice code" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/files/$fileId/reviews" -Method Post -Headers $headers1 -ContentType "application/json" -Body $rBody
        $script:reviewId = $res.data.id
    }

    # 9. Fetch reviews scoped to version
    Run-Test "Fetch reviews scoped to version" {
        $res = Invoke-RestMethod -Uri "$baseUrl/files/$fileId/reviews?versionId=$v2Id" -Method Get -Headers $headers1
        if ($res.data.length -eq 0) { throw "No reviews returned for version" }
        if ($res.data[0].version_id -ne $v2Id) { throw "Review version scoping mismatch" }
    }

    # 10. Attempt 403 cases as non-member
    $headers3 = @{}
    Run-Test "Attempt 403 cases (closing review as non-owner, creating task as non-member)" {
        # Login as divyesh (u3, no access to this project)
        $login3 = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -ContentType "application/json" -Body (@{ identifier="divyesh"; password="password" } | ConvertTo-Json)
        $script:headers3 = @{ Authorization="Bearer $($login3.data.token)" }

        $caughtReview = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers3 -ContentType "application/json" -Body (@{ status="closed" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Forbidden") { $caughtReview = $true }
        }
        if (-not $caughtReview) { throw "Closing review as non-owner did NOT return 403" }

        $caughtTask = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers3 -ContentType "application/json" -Body (@{ project_id=$newProjectId; title="Task"; priority="low" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Forbidden") { $caughtTask = $true }
        }
        if (-not $caughtTask) { throw "Creating task as non-member did NOT return 403" }
    }

    # 11. Convert review to task (strengthened)
    $convertedTaskId = ""
    Run-Test "Convert a review to a task" {
        $tBody = @{ project_id=$newProjectId; review_id=$reviewId; title="Fix something"; priority="high" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers1 -ContentType "application/json" -Body $tBody
        if (-not $res.data.id) { throw "Failed to create task from review" }
        if ($res.data.review_id -ne $reviewId) {
            throw "Stored review_id ($($res.data.review_id)) does not match expected reviewId ($reviewId)"
        }
        $script:convertedTaskId = $res.data.id
    }

    # 12. Fetch global search results
    Run-Test "Fetch global search results" {
        $res = Invoke-RestMethod -Uri "$baseUrl/search?q=test" -Method Get -Headers $headers1
        if ($null -eq $res.data.projects -or $null -eq $res.data.files -or $null -eq $res.data.users) {
            throw "Missing arrays in search response"
        }
        if ($res.data.users.GetType().IsArray -eq $false) { throw "users is not an array" }
    }

    # =========================================================================
    # PART B EXPANDED TESTS: T1 to T9
    # =========================================================================

    # T1: Partial task update ({status} only) keeps title, priority, assignee, due_date
    Run-Test "T1: Partial task update keeps other fields intact" {
        # Create a detailed task first
        $initTaskBody = @{
            project_id = $newProjectId
            title = "Task for T1"
            description = "Preserve this description"
            priority = "low"
            assigned_to = "u2"
            due_date = "2026-11-20"
        } | ConvertTo-Json
        $tRes = Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers1 -ContentType "application/json" -Body $initTaskBody
        $tId = $tRes.data.id

        # Update ONLY { status: "completed" }
        $patchBody = @{ status = "completed" } | ConvertTo-Json
        $upRes = Invoke-RestMethod -Uri "$baseUrl/tasks/$tId" -Method Put -Headers $headers1 -ContentType "application/json" -Body $patchBody

        $task = $upRes.data
        if ($task.status -ne "completed") { throw "Status was not updated to completed" }
        if ($task.title -ne "Task for T1") { throw "Title was erased: got '$($task.title)'" }
        if ($task.description -ne "Preserve this description") { throw "Description was erased" }
        if ($task.priority -ne "low") { throw "Priority was erased: got '$($task.priority)'" }
        if ($task.assigned_to -ne "u2") { throw "Assignee was erased: got '$($task.assigned_to)'" }
        if ($task.due_date -ne "2026-11-20") { throw "Due date was erased: got '$($task.due_date)'" }
    }

    # T2: Task from a review keeps review_id; a review from another project -> 400
    Run-Test "T2: Task from a review keeps review_id; review from another project yields 400" {
        # review 'r2' is on project 'p1' (file f1). Attempt to attach 'r2' to a task on $newProjectId
        $badBody = @{ project_id = $newProjectId; review_id = "r2"; title = "Bad Cross Project Task"; priority = "low" } | ConvertTo-Json
        $caught = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers1 -ContentType "application/json" -Body $badBody -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "BadRequest") { $caught = $true }
        }
        if (-not $caught) { throw "Task creation with cross-project review did NOT return 400" }
    }

    # T3: Assigning a task to a non-member -> 400
    Run-Test "T3: Assigning a task to a non-member yields 400" {
        # u3 is NOT a member of $newProjectId
        $badAssigneeBody = @{ project_id = $newProjectId; title = "Task with invalid assignee"; assigned_to = "u3" } | ConvertTo-Json
        $caught = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers1 -ContentType "application/json" -Body $badAssigneeBody -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "BadRequest") { $caught = $true }
        }
        if (-not $caught) { throw "Assigning task to non-member did NOT return 400" }
    }

    # T4: Review lifecycle transitions and role permissions
    Run-Test "T4: Review lifecycle transitions and role permissions" {
        # 1. Collaborator resolves ($reviewId is open)
        $resRes = Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers2 -ContentType "application/json" -Body (@{ status = "resolved" } | ConvertTo-Json)
        if ($resRes.data.status -ne "resolved" -or -not $resRes.data.resolved_at) { throw "Collaborator failed to resolve review" }

        # 2. Collaborator cannot close (403)
        $caughtCollabClose = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers2 -ContentType "application/json" -Body (@{ status = "closed" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Forbidden") { $caughtCollabClose = $true }
        }
        if (-not $caughtCollabClose) { throw "Collaborator closing review did NOT return 403" }

        # 3. Owner cannot close an open review (409)
        $openRevRes = Invoke-RestMethod -Uri "$baseUrl/files/$fileId/reviews" -Method Post -Headers $headers1 -ContentType "application/json" -Body (@{ file_id=$fileId; version_id=$v2Id; line_number=2; review_type="improvement"; comment="Need docs" } | ConvertTo-Json)
        $openRevId = $openRevRes.data.id

        $caughtOwnerCloseOpen = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/reviews/$openRevId/status" -Method Put -Headers $headers1 -ContentType "application/json" -Body (@{ status = "closed" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Conflict") { $caughtOwnerCloseOpen = $true }
        }
        if (-not $caughtOwnerCloseOpen) { throw "Owner closing open review did NOT return 409" }

        # 4. Owner closes a resolved review ($reviewId)
        $ownerCloseRes = Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers1 -ContentType "application/json" -Body (@{ status = "closed" } | ConvertTo-Json)
        if ($ownerCloseRes.data.status -ne "closed" -or -not $ownerCloseRes.data.closed_at -or -not $ownerCloseRes.data.resolved_at) {
            throw "Owner closing resolved review failed or lost resolved_at"
        }

        # 5. Collaborator cannot reopen a closed review (403)
        $caughtCollabReopen = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers2 -ContentType "application/json" -Body (@{ status = "open" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Forbidden") { $caughtCollabReopen = $true }
        }
        if (-not $caughtCollabReopen) { throw "Collaborator reopening closed review did NOT return 403" }

        # 6. Owner reopens closed review -> status open, reopen_count 1, resolved_*/closed_* null
        $ownerReopenRes = Invoke-RestMethod -Uri "$baseUrl/reviews/$reviewId/status" -Method Put -Headers $headers1 -ContentType "application/json" -Body (@{ status = "open" } | ConvertTo-Json)
        $reopened = $ownerReopenRes.data
        if ($reopened.status -ne "open") { throw "Status is not open after reopen" }
        if ($reopened.reopen_count -ne 1) { throw "reopen_count is not 1 (got $($reopened.reopen_count))" }
        if ($reopened.resolved_at -ne $null) { throw "resolved_at was not cleared" }
        if ($reopened.resolved_by -ne $null) { throw "resolved_by was not cleared" }
        if ($reopened.closed_at -ne $null) { throw "closed_at was not cleared" }
        if ($reopened.closed_by -ne $null) { throw "closed_by was not cleared" }
        if (-not $reopened.reopened_at) { throw "reopened_at was not recorded" }
    }

    # T5: Invitation lifecycle (reject, reinvite, duplicate pending 409, self-invite 400, double-response 409, notifications)
    Run-Test "T5: Invitation lifecycle, duplicate handling, notifications" {
        # Login as u5 (sneha)
        $login5 = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -ContentType "application/json" -Body (@{ identifier="sneha"; password="password" } | ConvertTo-Json)
        $headers5 = @{ Authorization="Bearer $($login5.data.token)" }

        # 1. Invite u5
        $invRes = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members/invitations" -Method Post -Headers $headers1 -ContentType "application/json" -Body (@{ userId="u5" } | ConvertTo-Json)
        $m5Id = $invRes.data.id

        # Duplicate pending -> 409
        $caughtDupPending = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members/invitations" -Method Post -Headers $headers1 -ContentType "application/json" -Body (@{ userId="u5" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Conflict") { $caughtDupPending = $true }
        }
        if (-not $caughtDupPending) { throw "Inviting an already pending user did NOT return 409" }

        # Self-invite -> 400
        $caughtSelfInvite = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members/invitations" -Method Post -Headers $headers1 -ContentType "application/json" -Body (@{ userId="u1" } | ConvertTo-Json) -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "BadRequest") { $caughtSelfInvite = $true }
        }
        if (-not $caughtSelfInvite) { throw "Self-invitation did NOT return 400" }

        # 2. Decline the invitation as u5
        $decRes = Invoke-RestMethod -Uri "$baseUrl/notifications/invitations/$m5Id/decline" -Method Post -Headers $headers5 -ContentType "application/json"
        if (-not $decRes.success) { throw "Decline invitation failed" }

        # Responding twice -> 409
        $caughtTwice = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/notifications/invitations/$m5Id/decline" -Method Post -Headers $headers5 -ContentType "application/json" -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Conflict") { $caughtTwice = $true }
        }
        if (-not $caughtTwice) { throw "Responding twice did NOT return 409" }

        # Invitee keeps theirs (marked read)
        $u5Notifs = Invoke-RestMethod -Uri "$baseUrl/notifications" -Method Get -Headers $headers5
        $invNotif = $u5Notifs.data | Where-Object { $_.reference_id -eq $m5Id }
        if (-not $invNotif) { throw "Invitee did NOT keep invitation notification" }
        if ($invNotif.is_read -ne $true) { throw "Invitee notification was not marked read" }

        # Inviter receives notification
        $u1Notifs = Invoke-RestMethod -Uri "$baseUrl/notifications" -Method Get -Headers $headers1
        $inviterNotif = $u1Notifs.data | Where-Object { $_.message -match "declined your invitation" }
        if (-not $inviterNotif) { throw "Inviter did NOT receive decline notification" }

        # Re-invite succeeds (reuses SAME member id, resets status to pending)
        $reinvRes = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members/invitations" -Method Post -Headers $headers1 -ContentType "application/json" -Body (@{ userId="u5" } | ConvertTo-Json)
        if ($reinvRes.data.id -ne $m5Id) { throw "Re-invite did not reuse the same member row id ($($reinvRes.data.id) vs $m5Id)" }
        if ($reinvRes.data.status -ne "pending") { throw "Re-invite status is not pending" }
    }

    # T6: Member privacy (viewer list has no emails and no pending rows; owner list includes pending row)
    Run-Test "T6: Member privacy: emails stripped and pending rows hidden for viewers" {
        # As viewer (u3):
        $viewerMembers = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members" -Method Get -Headers $headers3
        foreach ($m in $viewerMembers.data) {
            if ($null -ne $m.user_email -and $m.user_email -ne "") {
                throw "Viewer received email for member $($m.user_full_name)"
            }
            if ($m.status -eq "pending" -or $m.status -eq "rejected") {
                throw "Viewer received pending/rejected member row ($($m.user_id))"
            }
        }

        # As owner (u1):
        $ownerMembers = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId/members" -Method Get -Headers $headers1
        foreach ($m in $ownerMembers.data) {
            if ($null -ne $m.user_email -and $m.user_email -ne "") {
                throw "Owner member list leaked email: $($m.user_email)"
            }
        }
        $pendingU5 = $ownerMembers.data | Where-Object { $_.user_id -eq "u5" -and $_.status -eq "pending" }
        if (-not $pendingU5) { throw "Owner member list missing pending invitation row for u5" }
    }

    # T7: Marking another user's notification read -> 403
    Run-Test "T7: Marking another user's notification read yields 403" {
        $u1Notifs = Invoke-RestMethod -Uri "$baseUrl/notifications" -Method Get -Headers $headers1
        if ($u1Notifs.data.length -eq 0) { throw "No notifications found for u1 to test" }
        $targetNotifId = $u1Notifs.data[0].id

        $caught403 = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/notifications/$targetNotifId/read" -Method Put -Headers $headers3 -ContentType "application/json" -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "Forbidden") { $caught403 = $true }
        }
        if (-not $caught403) { throw "Marking another user's notification read did NOT return 403" }
    }

    # T8: GET /api/dashboard/activity items have userName and projectName
    Run-Test "T8: Dashboard activity items have userName and projectName" {
        $actRes = Invoke-RestMethod -Uri "$baseUrl/dashboard/activity" -Method Get -Headers $headers1
        if ($actRes.data.length -eq 0) { throw "No activity items returned" }
        $first = $actRes.data[0]
        if (-not $first.userName) { throw "Activity item missing userName" }
        if (-not $first.projectName) { throw "Activity item missing projectName" }
    }

    # T9: Deleting a project makes project, files, tasks, and reviews unreachable
    Run-Test "T9: Deleting a project cascades to make files, tasks, reviews unreachable" {
        # Delete project
        $delRes = Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId" -Method Delete -Headers $headers1
        if (-not $delRes.success) { throw "Delete project failed" }

        # 1. Project is 404
        $caughtProj = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/projects/$newProjectId" -Method Get -Headers $headers1 -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "NotFound") { $caughtProj = $true }
        }
        if (-not $caughtProj) { throw "Deleted project is still reachable" }

        # 2. File is 404
        $caughtFile = $false
        try {
            Invoke-RestMethod -Uri "$baseUrl/files/$fileId" -Method Get -Headers $headers1 -ErrorAction Stop
        } catch {
            if ($_.Exception.Response.StatusCode -eq "NotFound") { $caughtFile = $true }
        }
        if (-not $caughtFile) { throw "Deleted project file is still reachable" }

        # 3. Tasks are empty
        $tasksRes = Invoke-RestMethod -Uri "$baseUrl/tasks?projectId=$newProjectId" -Method Get -Headers $headers1
        if ($tasksRes.data.length -ne 0) { throw "Tasks still exist for deleted project" }

        # 4. Reviews are empty
        $revsRes = Invoke-RestMethod -Uri "$baseUrl/reviews/all?projectId=$newProjectId" -Method Get -Headers $headers1
        if ($revsRes.data.length -ne 0) { throw "Reviews still exist for deleted project" }
    }

} finally {
    Write-Host "Stopping Backend Server..."
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

# Run Integrity Check as specified in B2
Write-Host "`nRunning In-Memory Integrity Check (test:integrity)..."
node tests/integrity-check.js
if ($LASTEXITCODE -ne 0) {
    $script:failCount++
    Write-Host "[FAIL] Integrity Check suite failed" -ForegroundColor Red
} else {
    $script:passCount++
    Write-Host "[PASS] Integrity Check suite passed" -ForegroundColor Green
}

Write-Host "`n======================================================="
$summaryColor = "Green"
if ($failCount -gt 0) { $summaryColor = "Red" }
Write-Host "TEST SUMMARY: $passCount PASSED, $failCount FAILED" -ForegroundColor $summaryColor
Write-Host "======================================================="

if ($failCount -gt 0) {
    exit 1
} else {
    exit 0
}
