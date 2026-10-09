let activeProjectId = null;
let currentUserId = null;

const _pageRender = async () => {
    const user = await Store.getCurrentUser();
    currentUserId = user.id;
    
    const projectsList = document.getElementById('msg-projects-list');
    
    try {
        const projects = await Store.getProjects();
        if (projects.length === 0) {
            projectsList.innerHTML = '<div class="p-3 text-muted text-small text-center">No projects available</div>';
            return;
        }
        
        projectsList.innerHTML = projects.map(p => `
            <div class="msg-project-item p-3" data-id="${p.id}" style="cursor:pointer; border-bottom:1px solid var(--border); transition:background 0.2s;">
                <div class="text-bold text-truncate">${Utils.escapeHtml(p.name)}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.msg-project-item').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('.msg-project-item').forEach(item => item.style.background = '');
                el.style.background = 'var(--bg-app)';
                
                activeProjectId = el.getAttribute('data-id');
                const p = projects.find(proj => proj.id === activeProjectId);
                document.getElementById('msg-header').textContent = p.name;
                
                loadMessages(activeProjectId, p.userRole);
            });
        });
        
    } catch (e) {
        projectsList.innerHTML = '<div class="p-3 text-danger text-small">Error loading projects</div>';
    }
};

const loadMessages = async (projectId, role) => {
    const content = document.getElementById('msg-content');
    const formContainer = document.getElementById('msg-form-container');
    
    content.innerHTML = '<div class="text-center text-muted mt-4">Loading messages...</div>';
    
    const canSend = role === 'owner' || role === 'collaborator';
    formContainer.style.display = canSend ? 'block' : 'none';
    
    try {
        const messages = await Store.getMessages(projectId);
        
        if (messages.length === 0) {
            content.innerHTML = '<div class="text-center text-muted mt-4">No messages yet.</div>';
        } else {
            content.innerHTML = messages.map(m => {
                const isMe = m.sender_id === currentUserId;
                return `
                    <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:8px;">
                        <div class="text-small text-muted mb-1" style="font-size:10px;">${isMe ? 'You' : Utils.escapeHtml(m.senderName)} &bull; ${Utils.formatDate(m.created_at)}</div>
                        <div style="background:${isMe ? 'var(--accent)' : 'var(--bg-app)'}; color:${isMe ? '#fff' : 'inherit'}; padding:8px 12px; border-radius:8px; max-width:80%; word-break:break-word;">
                            ${Utils.escapeHtml(m.content)}
                        </div>
                    </div>
                `;
            }).join('');
            content.scrollTop = content.scrollHeight;
        }
    } catch (e) {
        content.innerHTML = `<div class="text-center text-danger mt-4">${e.message}</div>`;
    }
};

document.getElementById('msg-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;
    
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('msg-send-btn');
    const val = input.value.trim();
    if (!val) return;
    
    btn.disabled = true;
    try {
        await Store.sendMessage(activeProjectId, val);
        input.value = '';
        
        const projects = await Store.getProjects();
        const p = projects.find(proj => proj.id === activeProjectId);
        await loadMessages(activeProjectId, p.userRole);
    } catch (e) {
        UI.toast(e.message, 'error');
    } finally {
        btn.disabled = false;
        input.focus();
    }
});

document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
