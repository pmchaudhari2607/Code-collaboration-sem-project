const _pageRender = async () => {
  const projectId = Utils.getQueryParam('id');
  if (!projectId) {
     UI.renderEmptyState('error-container', 'Project Not Found', 'No project ID provided in URL.', window.icon('folder'), '<a href="projects.html" class="btn btn-primary">Go to Projects</a>');
     document.getElementById('error-container').style.display = 'block';
     return;
  }
  
  let projectData;
  try {
     projectData = await Store.getProject(projectId);
  } catch (err) {
     UI.renderEmptyState('error-container', 'Access Denied', err.message, window.icon('lock'), '<a href="projects.html" class="btn btn-primary">Go to Projects</a>');
     document.getElementById('error-container').style.display = 'block';
     return;
  }
  
  document.getElementById('project-container').style.display = 'block';
  
  const renderHeader = () => {
     document.getElementById('pd-name').textContent = projectData.name;
     document.title = `${projectData.name} - CodeReviewHub`;
     
     const visIcon = projectData.visibility === 'public' ? window.icon('globe') : window.icon('lock');
     document.getElementById('pd-title').innerHTML = `
        ${Utils.escapeHtml(projectData.name)}
        <span class="badge badge-neutral" style="font-size:12px; font-weight:500;">${visIcon} <span style="text-transform:capitalize;">${projectData.visibility}</span></span>
        ${UI.getRoleBadge(projectData.userRole)}
     `;
     document.getElementById('pd-desc').textContent = projectData.description || 'No description provided.';
     
     if (projectData.userRole === 'owner') {
        document.getElementById('pd-actions').style.display = 'flex';
        document.getElementById('edit-proj-name').value = projectData.name;
        document.getElementById('edit-proj-desc').value = projectData.description;
        document.querySelector(`input[name="edit-proj-vis"][value="${projectData.visibility}"]`).checked = true;
     }
  };
  
  const renderOverview = async () => {
     document.getElementById('ov-files').textContent = projectData.files.length;
     document.getElementById('ov-members').textContent = projectData.members.length;
     
     const reviews = await Store.getReviews({ projectId });
     const openReviews = reviews.filter(r => r.status === 'open').length;
     document.getElementById('ov-reviews').textContent = openReviews;
     
     const fileContainer = document.getElementById('ov-recent-files');
     if (projectData.files.length === 0) {
         UI.renderEmptyState('ov-recent-files', 'No files yet', 'Start by adding a code file.', window.icon('file'));
     } else {
         fileContainer.innerHTML = projectData.files.map(f => `
            <a href="code-editor.html?file=${f.id}" class="list-item text-primary" style="text-decoration:none; color:inherit;">
               ${UI.getLanguageBadge(f.language)}
               <div style="flex:1;">
                 <div class="text-bold">${Utils.escapeHtml(f.file_name)}</div>
                 <div class="text-small text-muted">Version ${f.currentVersionNumber} &bull; ${f.openReviewsCount} open reviews</div>
               </div>
            </a>
         `).join('');
     }
     
     const tasks = await Store.getTasks(projectId);
     const taskContainer = document.getElementById('ov-recent-tasks');
     const pendingTasks = tasks.filter(t => t.status !== 'completed').slice(0,5);
     if (pendingTasks.length === 0) {
         UI.renderEmptyState('ov-recent-tasks', 'No pending tasks', 'All clear.', window.icon('check'));
     } else {
         taskContainer.innerHTML = pendingTasks.map(t => `
            <div class="list-item justify-content-between">
               <div>
                  <div class="text-bold">${Utils.escapeHtml(t.title)}</div>
                  <div class="text-small text-muted">Due ${Utils.formatDate(t.due_date)}</div>
               </div>
               ${UI.getPriorityBadge(t.priority)}
            </div>
         `).join('');
     }
  };
  
  const renderFiles = () => {
     const canEditFiles = projectData.userRole === 'owner' || projectData.userRole === 'collaborator';
     const fileActions = document.getElementById('files-action-btns');
     if (fileActions) fileActions.style.display = canEditFiles ? 'flex' : 'none';
     
     const tbody = document.querySelector('#table-files tbody');
     if (projectData.files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No files added yet.</td></tr>`;
     } else {
        tbody.innerHTML = projectData.files.map(f => `
           <tr class="clickable-row" onclick="window.location.href='code-editor.html?file=${f.id}'">
              <td class="text-bold d-flex align-items-center gap-2">${window.icon('file')} ${Utils.escapeHtml(f.file_name)}</td>
              <td>${UI.getLanguageBadge(f.language)}</td>
              <td>v${f.currentVersionNumber}</td>
              <td>${Utils.formatDate(f.updated_at)}</td>
              <td>${Utils.escapeHtml(f.creatorName)}</td>
              <td>${f.openReviewsCount > 0 ? `<span class="badge badge-warning">${f.openReviewsCount} Open</span>` : '<span class="text-muted">0 Open</span>'}</td>
           </tr>
        `).join('');
     }
  };
  
  const renderReviews = async () => {
     const reviews = await Store.getReviews({ projectId });
     const container = document.getElementById('reviews-list');
     if (reviews.length === 0) {
        UI.renderEmptyState('reviews-list', 'No reviews yet', 'Reviews added to code files will appear here.', window.icon('messageSquare'));
     } else {
        container.innerHTML = `
           <table style="width:100%; border-collapse:collapse;">
             <thead><tr><th>File</th><th>Line</th><th>Type</th><th>Reviewer</th><th>Status</th><th>Date</th></tr></thead>
             <tbody>
               ${reviews.map(r => `
                 <tr class="clickable-row" onclick="window.location.href='code-editor.html?file=${r.file_id}'">
                   <td class="text-bold">${Utils.escapeHtml(r.fileName)}</td>
                   <td>Line ${r.line_number}</td>
                   <td>${UI.getReviewTypeBadge(r.review_type)}</td>
                   <td>${Utils.escapeHtml(r.reviewerName)}</td>
                   <td>${UI.getReviewStatusBadge(r.status)}</td>
                   <td>${Utils.formatDate(r.created_at)}</td>
                 </tr>
               `).join('')}
             </tbody>
           </table>
        `;
     }
  };
  
  const renderMembers = () => {
     if (projectData.userRole === 'owner') {
        document.getElementById('btn-invite').style.display = 'inline-flex';
     }
     const tbody = document.querySelector('#table-members tbody');
     tbody.innerHTML = projectData.members.map(m => {
        const isOwner = m.role === 'owner';
        let actionHtml = '';
        if (projectData.userRole === 'owner' && !isOwner) {
            actionHtml = `<button class="btn btn-ghost text-danger" onclick="removeMember('${m.user_id}', '${Utils.escapeHtml(m.user_full_name)}')">${window.icon('trash')}</button>`;
        }
        
        let statusBadge = '';
        if (m.status === 'pending') statusBadge = '<span class="badge badge-warning">Pending</span>';
        else if (m.status === 'accepted') statusBadge = '<span class="badge badge-success">Accepted</span>';
        
        return `
           <tr>
              <td>
                 <div class="d-flex align-items-center gap-2">
                    ${UI.getAvatarHtml(m.user_full_name)}
                    <div>
                       <div class="text-bold">${Utils.escapeHtml(m.user_full_name)}</div>
                       <div class="text-small text-muted">@${Utils.escapeHtml(m.user_username)}</div>
                    </div>
                 </div>
              </td>
              <td>${UI.getRoleBadge(m.role)}</td>
              <td>${statusBadge}</td>
              <td>${actionHtml}</td>
           </tr>
        `;
     }).join('');
  };
  
  const renderTasks = async () => {
     const tasks = await Store.getTasks(projectId);
     const container = document.getElementById('tasks-list');
     if (tasks.length === 0) {
        UI.renderEmptyState('tasks-list', 'No tasks', 'Create tasks or convert reviews to tasks.', window.icon('check'));
     } else {
        container.innerHTML = `
           <table style="width:100%; border-collapse:collapse;">
             <thead><tr><th style="width:30px;"></th><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due Date</th></tr></thead>
             <tbody>
               ${tasks.map(t => {
                 const isDone = t.status === 'completed';
                 const canEdit = t.canEdit !== undefined ? t.canEdit : (projectData && (projectData.userRole === 'owner' || projectData.userRole === 'collaborator'));
                 let sBadge = t.status === 'completed' ? '<span class="badge badge-success">Completed</span>' : 
                              (t.status === 'in_progress' ? '<span class="badge badge-info">In Progress</span>' : '<span class="badge badge-neutral">To Do</span>');
                 return `
                 <tr style="${isDone ? 'opacity:0.6;' : ''}">
                   <td>
                     <input type="checkbox" style="cursor:pointer;" ${isDone ? 'checked' : ''} ${canEdit ? '' : 'disabled title="You do not have permission to edit this task"'} onchange="toggleProjectTask('${t.id}', this.checked, this)">
                   </td>
                   <td class="text-bold" style="${isDone ? 'text-decoration:line-through;' : ''}">${Utils.escapeHtml(t.title)}</td>
                   <td>${sBadge}</td>
                   <td>${UI.getPriorityBadge(t.priority)}</td>
                   <td>${t.assigneeName ? Utils.escapeHtml(t.assigneeName) : '<span class="text-muted">Unassigned</span>'}</td>
                   <td>${Utils.formatDate(t.due_date)}</td>
                 </tr>
               `}).join('')}
             </tbody>
           </table>
        `;
     }
  };

  window.toggleProjectTask = async (id, isDone, cb) => {
     if (cb) cb.disabled = true;
     try {
        await Store.updateTask(id, { status: isDone ? 'completed' : 'todo' });
        UI.toast(isDone ? 'Task completed' : 'Task reopened', 'success');
        renderTasks();
     } catch (err) {
        if (cb) {
           cb.checked = !isDone;
           cb.disabled = false;
        }
        UI.toast(err.message, 'error');
        renderTasks();
     }
  };

  const renderActivity = async () => {
     const activity = await Store.getProjectActivity(projectId);
     const container = document.getElementById('activity-list');
     if (activity.length === 0) {
        UI.renderEmptyState('activity-list', 'No activity', 'No activity has been recorded yet.', window.icon('clock'));
     } else {
        container.innerHTML = activity.map(a => `
           <div class="list-item" style="border:none; border-bottom:1px solid var(--border); border-radius:0; padding:16px;">
              <div class="d-flex align-items-center gap-2">
                 ${UI.getAvatarHtml(a.userName)}
                 <div>
                    <div class="text-small">
                       <span class="text-bold">${Utils.escapeHtml(a.userName)}</span> 
                       ${Utils.escapeHtml(a.action_text)}
                    </div>
                    <div class="text-small text-muted">${Utils.formatDate(a.created_at)}</div>
                 </div>
              </div>
           </div>
        `).join('');
     }
  };

  renderHeader();
  renderOverview();
  
  // Tab Navigation
  document.querySelectorAll('#project-tabs .tab').forEach(tab => {
     tab.onclick = (e => {
        document.querySelectorAll('#project-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(`tab-${tabId}`).style.display = 'block';
        
        if (tabId === 'files') renderFiles();
        if (tabId === 'reviews') renderReviews();
        if (tabId === 'members') renderMembers();
        if (tabId === 'tasks') renderTasks();
        if (tabId === 'activity') renderActivity();
     });
  });

  // Edit Project
  document.getElementById('form-edit-project').onsubmit = async (e) => {
     e.preventDefault();
     const btn = e.target.querySelector('button[type="submit"]');
     btn.disabled = true;
     btn.textContent = 'Saving...';
     
     const data = {
        name: document.getElementById('edit-proj-name').value.trim(),
        description: document.getElementById('edit-proj-desc').value.trim(),
        visibility: document.querySelector('input[name="edit-proj-vis"]:checked').value
     };
     
     try {
       projectData = await Store.updateProject(projectId, data);
       UI.toast('Project updated successfully', 'success');
       UI.closeModal('modal-edit-project');
       renderHeader();
     } catch (err) {
       UI.toast(err.message, 'error');
     } finally {
       btn.disabled = false;
       btn.textContent = 'Save Changes';
     }
  };

  // Add File
  document.getElementById('form-add-file').onsubmit = async (e) => {
     e.preventDefault();
     const btn = e.target.querySelector('button[type="submit"]');
     btn.disabled = true;
     btn.textContent = 'Creating...';
     
     const data = {
        file_name: document.getElementById('file-name').value.trim(),
        language: document.getElementById('file-lang').value
     };
     
     // add simple template
     if (data.language === 'C') data.current_code = `#include <stdio.h>\n\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}\n`;
     if (data.language === 'Java') {
        const clsName = data.file_name.split('.')[0] || 'Main';
        data.current_code = `public class ${clsName} {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}\n`;
     }
     if (data.language === 'Python') data.current_code = `def main():\n    print("Hello World")\n\nif __name__ == "__main__":\n    main()\n`;
     
     try {
       const newFile = await Store.createFile(projectId, data);
       UI.toast('File created successfully', 'success');
       window.location.href = `code-editor.html?file=${newFile.id}`;
     } catch (err) {
       UI.toast(err.message, 'error');
       btn.disabled = false;
       btn.textContent = 'Create File';
     }
  };
  
  // File Upload
  const btnUpload = document.getElementById('btn-upload-file');
  const fileInput = document.getElementById('file-upload-input');
  if (btnUpload && fileInput) {
     btnUpload.onclick = () => fileInput.click();
     fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (readEvt) => {
           const content = readEvt.target.result;
           const ext = file.name.split('.').pop().toLowerCase();
           let lang = 'C';
           if (ext === 'java') lang = 'Java';
           else if (ext === 'py') lang = 'Python';
           else if (['c', 'h', 'cpp', 'cc'].includes(ext)) lang = 'C';
           
           btnUpload.disabled = true;
           btnUpload.textContent = 'Uploading...';
           try {
              await Store.createFile(projectId, {
                 file_name: file.name,
                 language: lang,
                 current_code: content
              });
              UI.toast(`Uploaded ${file.name} successfully!`, 'success');
              projectData = await Store.getProject(projectId);
              renderOverview();
              renderFiles();
           } catch (err) {
              UI.toast(err.message, 'error');
           } finally {
              btnUpload.disabled = false;
              btnUpload.innerHTML = '<span class="icon" data-icon="upload"></span> Upload File';
              fileInput.value = '';
           }
        };
        reader.readAsText(file);
     };
  }

  // Member Invitation Search & Invite
  const searchInput = document.getElementById('invite-search-input');
  const resultsContainer = document.getElementById('invite-user-results');
  const selectedUserIdInput = document.getElementById('selected-invite-user-id');
  const selectedUserCard = document.getElementById('selected-user-card');
  const selectedUserName = document.getElementById('selected-user-name');
  const selectedUserHandle = document.getElementById('selected-user-handle');
  const selectedUserAvatar = document.getElementById('selected-user-avatar');
  const submitInviteBtn = document.getElementById('btn-submit-invitation');
  const clearSelectedBtn = document.getElementById('btn-clear-selected-user');
  
  const selectUserForInvite = (u) => {
     selectedUserIdInput.value = u.id;
     selectedUserName.textContent = u.full_name;
     selectedUserHandle.textContent = `@${u.username}`;
     selectedUserAvatar.innerHTML = UI.getAvatarHtml(u.full_name);
     selectedUserCard.style.display = 'flex';
     submitInviteBtn.disabled = false;
  };
  
  if (clearSelectedBtn) {
     clearSelectedBtn.onclick = () => {
        selectedUserIdInput.value = '';
        selectedUserCard.style.display = 'none';
        submitInviteBtn.disabled = true;
     };
  }
  
  if (searchInput && resultsContainer) {
     searchInput.oninput = Utils.debounce(async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) {
           resultsContainer.innerHTML = '<div class="text-muted text-small text-center py-3">Type at least 2 characters to search.</div>';
           return;
        }
        resultsContainer.innerHTML = '<div class="text-muted text-small text-center py-2">Searching...</div>';
        try {
           const matches = await Store.searchUsers(q);
           const currentMemberIds = new Set(projectData.members.map(m => m.user_id));
           const available = matches.filter(u => !currentMemberIds.has(u.id));
           
           if (available.length === 0) {
              resultsContainer.innerHTML = '<div class="text-muted text-small text-center py-3">No matching available users found.</div>';
              return;
           }
           resultsContainer.innerHTML = available.map(u => `
              <div class="list-item justify-content-between p-2 mb-1" style="cursor:pointer;" onclick='window._selectUser(${JSON.stringify(u).replace(/'/g, "&apos;")})'>
                 <div class="d-flex align-items-center gap-2">
                    ${UI.getAvatarHtml(u.full_name)}
                    <div>
                       <div class="text-bold text-small">${Utils.escapeHtml(u.full_name)}</div>
                       <div class="text-small text-muted">@${Utils.escapeHtml(u.username)}</div>
                    </div>
                 </div>
                 <button type="button" class="btn btn-secondary text-small" style="padding:4px 8px;">Select</button>
              </div>
           `).join('');
        } catch (err) {
           resultsContainer.innerHTML = `<div class="text-danger text-small text-center py-2">${Utils.escapeHtml(err.message)}</div>`;
        }
     }, 250);
  }
  
  window._selectUser = (u) => selectUserForInvite(u);
  
  const formInvite = document.getElementById('form-invite-member');
  if (formInvite) {
     formInvite.onsubmit = async (e) => {
        e.preventDefault();
        const targetUserId = selectedUserIdInput.value;
        if (!targetUserId) {
           UI.toast('Please select a user to invite', 'error');
           return;
        }
        submitInviteBtn.disabled = true;
        submitInviteBtn.textContent = 'Sending...';
        const role = document.getElementById('invite-role')?.value || 'collaborator';
        try {
           await Store.inviteMember(projectId, targetUserId, role);
           UI.toast('Invitation sent successfully!', 'success');
           UI.closeModal('modal-invite-member');
           if (searchInput) searchInput.value = '';
           if (resultsContainer) resultsContainer.innerHTML = '<div class="text-muted text-small text-center py-3">Type at least 2 characters to search.</div>';
           selectedUserIdInput.value = '';
           selectedUserCard.style.display = 'none';
           projectData = await Store.getProject(projectId);
           renderOverview();
           renderMembers();
        } catch (err) {
           UI.toast(err.message, 'error');
        } finally {
           submitInviteBtn.disabled = false;
           submitInviteBtn.textContent = 'Send Invitation';
        }
     };
  }

  window.removeMember = async (userId, name) => {
      const confirmed = await UI.confirmDialog('Remove Member', `Are you sure you want to remove ${name} from this project?`, 'Remove', 'danger');
      if (confirmed) {
          try {
             await Store.removeMember(projectId, userId);
             UI.toast('Member removed', 'success');
             projectData.members = projectData.members.filter(m => m.user_id !== userId);
             renderMembers();
          } catch(e) {
             UI.toast(e.message, 'error');
          }
      }
  };

  // Owner Delete Project
  window.openDeleteProjectModal = () => {
    if (projectData.userRole !== 'owner') {
      UI.toast('Only the project owner can delete this project.', 'error');
      return;
    }
    const nameEl = document.getElementById('delete-proj-name');
    if (nameEl) nameEl.textContent = projectData.name;
    const errEl = document.getElementById('delete-proj-error');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    UI.openModal('modal-delete-project');
  };

  const confirmDeleteProjectBtn = document.getElementById('btn-confirm-delete-project');
  if (confirmDeleteProjectBtn) {
    confirmDeleteProjectBtn.onclick = async () => {
      if (projectData.userRole !== 'owner') {
        UI.toast('Permission denied: only project owner can delete this project.', 'error');
        return;
      }
      try {
        confirmDeleteProjectBtn.disabled = true;
        confirmDeleteProjectBtn.innerHTML = 'Deleting...';
        await Store.deleteProject(projectId);
        UI.closeModal('modal-delete-project');
        sessionStorage.setItem('project_deleted_toast', `Project "${projectData.name}" was successfully deleted.`);
        window.location.href = 'projects.html';
      } catch (err) {
        confirmDeleteProjectBtn.disabled = false;
        confirmDeleteProjectBtn.innerHTML = `<span class="icon" data-icon="trash"></span> Delete Project Permanently`;
        const errEl = document.getElementById('delete-proj-error');
        if (errEl) {
          errEl.textContent = err.message || 'Failed to delete project.';
          errEl.style.display = 'block';
        }
        UI.toast(err.message || 'Failed to delete project.', 'error');
      }
    };
  }
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
