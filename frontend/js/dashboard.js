const _pageRender = async () => {
  UI.renderSkeleton('stat-projects', 1);
  UI.renderSkeleton('stat-files', 1);
  UI.renderSkeleton('stat-reviews', 1);
  UI.renderSkeleton('stat-tasks', 1);
  
  document.getElementById('icon-stat1').innerHTML = window.icon('folder');
  document.getElementById('icon-stat2').innerHTML = window.icon('file');
  document.getElementById('icon-stat3').innerHTML = window.icon('messageSquare');
  document.getElementById('icon-stat4').innerHTML = window.icon('check');

  const user = await Store.getCurrentUser();
  if(!user) return; // handled by layout
  document.getElementById('welcome-title').textContent = `Welcome back, ${user.full_name.split(' ')[0]}`;

  const stats = await Store.getDashboardStats();
  document.getElementById('stat-projects').textContent = stats.totalProjects;
  document.getElementById('stat-projects-sub').textContent = `${stats.ownedProjects} owned - ${stats.collabProjects} collaborating`;
  document.getElementById('stat-files').textContent = stats.totalFiles;
  document.getElementById('stat-reviews').textContent = stats.openReviews;
  document.getElementById('stat-tasks').textContent = stats.pendingTasks;
  
  // Recent Projects
  const projects = await Store.getProjects();
  const recentProjects = projects.slice(0, 4);
  const rpContainer = document.getElementById('recent-projects');
  if (recentProjects.length === 0) {
    UI.renderEmptyState('recent-projects', 'No projects', 'Create your first project to get started.', window.icon('folder'), '<a href="projects.html?create=true" class="btn btn-primary">New Project</a>');
  } else {
    rpContainer.innerHTML = recentProjects.map(p => `
      <a href="project-details.html?id=${p.id}" class="list-item text-primary" style="text-decoration:none;">
        ${UI.getLanguageBadge(p.category)}
        <div style="flex:1; min-width:0;">
          <div class="text-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(p.name)}</div>
          <div class="text-small text-muted">${p.openReviewsCount} open reviews &bull; ${p.filesCount} files</div>
        </div>
        ${UI.getRoleBadge(p.userRole)}
      </a>
    `).join('');
  }
  
  // Upcoming Tasks
  const tasks = await Store.getTasks();
  const pending = tasks.filter(t => t.status !== 'completed').slice(0, 4);
  const taskContainer = document.getElementById('upcoming-tasks');
  if (pending.length === 0) {
    UI.renderEmptyState('upcoming-tasks', 'All caught up', 'No pending tasks.', window.icon('check'));
  } else {
    taskContainer.innerHTML = pending.map(t => {
      const isOverdue = new Date(t.due_date) < new Date();
      return `
      <div class="list-item">
        <input type="checkbox" style="cursor:pointer;" onchange="completeTask('${t.id}', this)">
        <div style="flex:1; min-width:0;">
          <div class="text-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(t.title)}</div>
          <div class="text-small text-muted">${Utils.escapeHtml(t.projectName)}</div>
        </div>
        <div style="text-align:right;">
          ${UI.getPriorityBadge(t.priority)}
          <div class="text-small ${isOverdue ? 'text-danger' : 'text-muted'} mt-1">${Utils.formatDate(t.due_date)}</div>
        </div>
      </div>
    `}).join('');
  }
  
  // Recent Activity
  const activity = await Store.getRecentActivity();
  const actContainer = document.getElementById('recent-activity');
  if (activity.length === 0) {
    UI.renderEmptyState('recent-activity', 'No activity', 'Start working on projects.', window.icon('clock'));
  } else {
    actContainer.innerHTML = activity.slice(0, 5).map(a => `
      <div class="d-flex align-items-center gap-2 mb-3">
        ${UI.getAvatarHtml(a.userName)}
        <div>
          <div class="text-small">
            <span class="text-bold">${Utils.escapeHtml(a.userName)}</span> 
            ${Utils.escapeHtml(a.action_text)}
          </div>
          <div class="text-small text-muted">${Utils.formatDate(a.created_at)}</div>
        </div>
      </div>
    `).join('');
  }
  
  // Invitations
  const notifs = await Store.getNotifications();
  const invites = notifs.filter(n => n.type === 'invitation' && n.memberContext && n.memberContext.status === 'pending');
  const invSec = document.getElementById('invitations-section');
  if (invites.length > 0) {
     if (invSec) invSec.style.display = 'block';
     document.getElementById('pending-invitations').innerHTML = invites.map(i => `
       <div class="list-item justify-content-between">
         <div class="d-flex align-items-center gap-2">
           ${window.icon('folder')}
           <div>
             <div class="text-bold">${Utils.escapeHtml(i.projectName)}</div>
             <div class="text-small text-muted">Invitation to collaborate</div>
           </div>
         </div>
         <div class="d-flex gap-1">
           <button class="btn btn-secondary" onclick="respondInvite('${i.memberContext.id}', false)">Reject</button>
           <button class="btn btn-primary" onclick="respondInvite('${i.memberContext.id}', true)">Accept</button>
         </div>
       </div>
     `).join('');
  } else {
     if (invSec) invSec.style.display = 'none';
  }
  
  // Render Fake Chart
  const chartContainer = document.getElementById('chart-container');
  const labelsContainer = document.getElementById('chart-labels');
  let html = '';
  let labelsHtml = '';
  for(let i=6; i>=0; i--) {
     const d = new Date();
     d.setDate(d.getDate() - i);
     const pct = Math.floor(Math.random() * 70) + 20;
     html += `<div class="chart-bar" style="height:${pct}%" data-tooltip="${Math.floor((pct/100)*20)} events"></div>`;
     labelsHtml += `<span>${d.toLocaleDateString('en-US',{weekday:'short'})}</span>`;
  }
  chartContainer.innerHTML = html;
  labelsContainer.innerHTML = labelsHtml;
  
  document.getElementById('btn-new-project').addEventListener('click', () => {
      window.location.href = 'projects.html?create=true';
  });
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);

window.completeTask = async (id, cb) => {
   cb.disabled = true;
   await Store.updateTask(id, { status: 'completed' });
   UI.toast('Task marked as completed', 'success');
   document.dispatchEvent(new Event('crh_user_changed'));
};

window.respondInvite = async (id, accept) => {
   await Store.respondInvitation(id, accept);
   UI.toast(accept ? 'Invitation accepted' : 'Invitation rejected', 'success');
   document.dispatchEvent(new Event('crh_user_changed'));
};
