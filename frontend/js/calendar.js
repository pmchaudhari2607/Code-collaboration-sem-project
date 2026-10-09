let currentDate = new Date();
const _pageRender = async () => {
    const container = document.querySelector('.card');
    container.innerHTML = '<div class="text-center py-4 text-muted">Loading calendar...</div>';
    
    try {
        const tasks = await Store.getTasks();
        const datedTasks = tasks.filter(t => t.due_date);
        
        container.style.padding = '24px';
        container.style.textAlign = 'left';
        
        const renderMonth = () => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            
            const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
            
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <button class="btn btn-secondary" id="cal-prev">&lt; Prev</button>
                    <h3 class="m-0">${monthName} ${year}</h3>
                    <button class="btn btn-secondary" id="cal-next">Next &gt;</button>
                </div>
            `;
            
            html += `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border);">`;
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            days.forEach(d => {
                html += `<div style="padding: 8px; background: var(--bg-card); text-align: center; font-weight: bold; font-size: 12px;">${d}</div>`;
            });
            
            for (let i = 0; i < firstDay; i++) {
                html += `<div style="background: var(--bg-app); min-height: 100px;"></div>`;
            }
            
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const dayTasks = datedTasks.filter(t => t.due_date.startsWith(dateStr));
                
                let taskHtml = '';
                dayTasks.forEach(t => {
                    const isDone = t.status === 'completed';
                    taskHtml += `<a href="project-details.html?id=${t.project_id}" style="display:block; font-size:10px; padding:4px; margin-bottom:2px; background: ${isDone ? 'var(--success-soft)' : 'var(--accent-soft)'}; color: ${isDone ? 'var(--success-text)' : 'var(--accent)'}; text-decoration:none; border-radius:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${Utils.escapeHtml(t.title)}">${Utils.escapeHtml(t.title)}</a>`;
                });
                
                html += `
                    <div style="background: var(--bg-card); min-height: 100px; padding: 8px;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; text-align: right;">${day}</div>
                        ${taskHtml}
                    </div>
                `;
            }
            
            const remaining = (firstDay + daysInMonth) % 7;
            if (remaining > 0) {
                for (let i = 0; i < 7 - remaining; i++) {
                    html += `<div style="background: var(--bg-app); min-height: 100px;"></div>`;
                }
            }
            html += `</div>`;
            
            if (datedTasks.length === 0) {
                 html += `<div class="mt-4 text-center text-muted">No tasks with due dates found.</div>`;
            }
            
            container.innerHTML = html;
            
            document.getElementById('cal-prev').onclick = () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderMonth();
            };
            document.getElementById('cal-next').onclick = () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                renderMonth();
            };
        };
        
        renderMonth();
        
    } catch (e) {
        container.innerHTML = `<div class="text-center py-4 text-danger">Failed to load calendar: ${e.message}</div>`;
    }
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
