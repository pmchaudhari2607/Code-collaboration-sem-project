$ErrorActionPreference = "Stop"

Write-Host "Starting Backend Server for tests..."
$process = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 3
$baseUrl = "http://localhost:5000/api"

function Assert-IsNumeric($val, $name) {
    if ($null -eq $val -or $val.GetType().Name -ne "Int32") {
        throw "Assertion failed: $name is not a number. Got: $val"
    }
}

function Run-Test($Name, $ScriptBlock) {
    try {
        & $ScriptBlock
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "       Error: $_" -ForegroundColor DarkRed
    }
}

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
Run-Test "Attempt 403 cases (closing review as non-owner, creating task as non-member)" {
    # Login as divyesh (u3, no access to this project)
    $login3 = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -ContentType "application/json" -Body (@{ identifier="divyesh"; password="password" } | ConvertTo-Json)
    $headers3 = @{ Authorization="Bearer $($login3.data.token)" }

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

# 11. Convert review to task
Run-Test "Convert a review to a task" {
    $tBody = @{ project_id=$newProjectId; review_id=$reviewId; title="Fix something"; priority="high" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Headers $headers1 -ContentType "application/json" -Body $tBody
    if (-not $res.data.id) { throw "Failed to create task from review" }
}

# 12. Fetch global search results
Run-Test "Fetch global search results" {
    $res = Invoke-RestMethod -Uri "$baseUrl/search?q=test" -Method Get -Headers $headers1
    if ($null -eq $res.data.projects -or $null -eq $res.data.files -or $null -eq $res.data.users) {
        throw "Missing arrays in search response"
    }
    if ($res.data.users.GetType().IsArray -eq $false) { throw "users is not an array" }
}

Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
Write-Host "Tests Complete."
