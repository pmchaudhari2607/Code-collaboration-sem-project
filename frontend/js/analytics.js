const _pageRender = async () => {
    const container = document.querySelector('.card');
    container.innerHTML = '<div class="text-center py-4 text-muted">Loading analytics...</div>';
    
    try {
        const stats = await Store.getDashboardStats();
        const tasks = await Store.getTasks();
        const reviews = await Store.getReviews();
        
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const totalTasks = tasks.length;
        
        const openReviews = reviews.filter(r => r.status === 'open').length;
        const resolvedReviews = reviews.filter(r => r.status === 'resolved' || r.status === 'closed').length;
        const totalReviews = reviews.length;
        
        container.style.padding = '24px';
        container.style.textAlign = 'left';
        
        container.innerHTML = `
            <div class="stats-grid mb-4" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
                <div class="stat-card" style="border: 1px solid var(--border); border-radius: 8px; padding: 24px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: var(--accent);">${stats.totalProjects}</div>
                    <div class="text-muted mt-1">Accessible Projects</div>
                </div>
                <div class="stat-card" style="border: 1px solid var(--border); border-radius: 8px; padding: 24px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: var(--accent);">${stats.totalFiles}</div>
                    <div class="text-muted mt-1">Total Code Files</div>
                </div>
                <div class="stat-card" style="border: 1px solid var(--border); border-radius: 8px; padding: 24px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: var(--accent);">${totalTasks}</div>
                    <div class="text-muted mt-1">Total Tasks</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div style="border: 1px solid var(--border); border-radius: 8px; padding: 24px;">
                    <h3 style="margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Task Completion</h3>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Completed</span>
                        <span class="text-bold text-success">${completedTasks}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Pending / Todo</span>
                        <span class="text-bold">${totalTasks - completedTasks}</span>
                    </div>
                </div>
                
                <div style="border: 1px solid var(--border); border-radius: 8px; padding: 24px;">
                    <h3 style="margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Review Status</h3>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Open</span>
                        <span class="text-bold text-warning">${openReviews}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Resolved / Closed</span>
                        <span class="text-bold text-success">${resolvedReviews}</span>
                    </div>
                    <div class="d-flex justify-content-between">
                        <span>Total Comments</span>
                        <span class="text-bold">${totalReviews}</span>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="text-center py-4 text-danger">Failed to load analytics: ${e.message}</div>`;
    }
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
