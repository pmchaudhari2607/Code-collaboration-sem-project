const _pageRender = async () => {
    const loadTeam = async () => {
        const tbody = document.querySelector('#table-team tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading...</td></tr>';
        
        try {
            const projects = await Store.getProjects();
            const membersList = [];
            
            projects.forEach(p => {
               p.members.forEach(m => {
                  membersList.push({
                     ...m,
                     projectName: p.name,
                     projectId: p.id
                  });
               });
            });
            
            if (membersList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No team members found.</td></tr>';
                return;
            }
            
            tbody.innerHTML = membersList.map(m => `
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
                  <td class="text-bold"><a href="project-details.html?id=${m.projectId}" style="color:inherit;text-decoration:none;">${Utils.escapeHtml(m.projectName)}</a></td>
                  <td>${UI.getRoleBadge(m.role)}</td>
                  <td>${m.status === 'pending' ? '<span class="badge badge-warning">Pending</span>' : '<span class="badge badge-success">Accepted</span>'}</td>
                  <td>${Utils.formatDate(m.joined_at)}</td>
               </tr>
            `).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${e.message}</td></tr>`;
        }
    };
    
    loadTeam();
    
    // Setup Invite Modal
    const projects = await Store.getProjects();
    const ownedProjects = projects.filter(p => p.userRole === 'owner');
    
    const projSelect = document.getElementById('invite-project');
    if (ownedProjects.length === 0) {
        projSelect.innerHTML = '<option value="">No projects owned</option>';
        projSelect.disabled = true;
    } else {
        projSelect.innerHTML = ownedProjects.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('');
    }
    
    const users = await Store.getUsers();
    const currentUser = await Store.getCurrentUser();
    const userSelect = document.getElementById('invite-user');
    userSelect.innerHTML = users.filter(u => u.id !== currentUser.id).map(u => `<option value="${u.id}">${Utils.escapeHtml(u.full_name)} (@${u.username})</option>`).join('');
    
    document.getElementById('form-invite').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pId = projSelect.value;
        const uId = userSelect.value;
        const role = document.getElementById('invite-role').value;
        
        if(!pId) return UI.toast('No project selected', 'error');
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        try {
            await Store.inviteMember(pId, uId, role);
            UI.toast('Invitation sent!', 'success');
            UI.closeModal('modal-invite');
            loadTeam();
        } catch(err) {
            UI.toast(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
