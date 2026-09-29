const _pageRender = async () => {
    const projects = await Store.getProjects();
    const filterProj = document.getElementById('filter-project');
    projects.forEach(p => {
       const opt = document.createElement('option');
       opt.value = p.id;
       opt.textContent = p.name;
       filterProj.appendChild(opt);
    });

    const loadTasks = async () => {
        const tbody = document.querySelector('#table-tasks tbody');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Loading...</td></tr>';
        
        const projId = filterProj.value === 'all' ? null : filterProj.value;
        const statusFilter = document.getElementById('filter-status').value;
        
        try {
            let tasks = await Store.getTasks(projId);
            
            if (statusFilter === 'pending') {
                tasks = tasks.filter(t => t.status !== 'completed');
            } else if (statusFilter === 'completed') {
                tasks = tasks.filter(t => t.status === 'completed');
            }
            
            if (tasks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No tasks found.</td></tr>';
                return;
            }
            
            tbody.innerHTML = tasks.map(t => {
               const isDone = t.status === 'completed';
               const isOverdue = !isDone && new Date(t.due_date) < new Date();
               return `
               <tr style="${isDone ? 'opacity:0.6;' : ''}">
                  <td>
                    <input type="checkbox" style="cursor:pointer;" ${isDone ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)">
                  </td>
                  <td class="text-bold" style="${isDone ? 'text-decoration:line-through;' : ''}">${Utils.escapeHtml(t.title)}</td>
                  <td>${Utils.escapeHtml(t.projectName)}</td>
                  <td>${t.assigneeName ? Utils.escapeHtml(t.assigneeName) : '<span class="text-muted">Unassigned</span>'}</td>
                  <td>${UI.getPriorityBadge(t.priority)}</td>
                  <td class="${isOverdue ? 'text-danger text-bold' : ''}">${Utils.formatDate(t.due_date)}</td>
               </tr>
            `}).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">${e.message}</td></tr>`;
        }
    };
    
    filterProj.addEventListener('change', loadTasks);
    document.getElementById('filter-status').addEventListener('change', loadTasks);
    
    window.toggleTask = async (id, isDone) => {
        try {
            await Store.updateTask(id, { status: isDone ? 'completed' : 'todo' });
            UI.toast(isDone ? 'Task completed' : 'Task reopened', 'success');
            loadTasks();
        } catch(e) {
            UI.toast(e.message, 'error');
        }
    };
    
    loadTasks();
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
