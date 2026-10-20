const _pageRender = async () => {
  // Bind New Project button BEFORE any await
  const btnNewProject = document.getElementById('btn-new-project');
  if (btnNewProject) {
    btnNewProject.onclick = () => {
      window.location.href = 'projects.html?create=true';
    };
  }

  UI.renderSkeleton('stat-projects', 1);
  UI.renderSkeleton('stat-files', 1);
  UI.renderSkeleton('stat-reviews', 1);
  UI.renderSkeleton('stat-tasks', 1);
  
  const icon1 = document.getElementById('icon-stat1'); if (icon1) icon1.innerHTML = window.icon('folder');
  const icon2 = document.getElementById('icon-stat2'); if (icon2) icon2.innerHTML = window.icon('file');
  const icon3 = document.getElementById('icon-stat3'); if (icon3) icon3.innerHTML = window.icon('messageSquare');
  const icon4 = document.getElementById('icon-stat4'); if (icon4) icon4.innerHTML = window.icon('check');

  // Widget 1: User welcome
  try {
    const user = await Store.getCurrentUser();
    if (user && user.full_name) {
      const welcome = document.getElementById('welcome-title');
      if (welcome) welcome.textContent = `Welcome back, ${user.full_name.split(' ')[0]}`;
    }
  } catch (err) {
    console.error('Failed to load user profile for dashboard:', err);
  }

  // Widget 2: Dashboard stats
  try {
    const stats = await Store.getDashboardStats();
    document.getElementById('stat-projects').textContent = stats.totalProjects;
    document.getElementById('stat-projects-sub').textContent = `${stats.ownedProjects} owned - ${stats.collabProjects} collaborating`;
    document.getElementById('stat-files').textContent = stats.totalFiles;
    document.getElementById('stat-reviews').textContent = stats.openReviews;
    document.getElementById('stat-tasks').textContent = stats.pendingTasks;
  } catch (err) {
    console.error('Failed to load stats:', err);
    ['stat-projects', 'stat-files', 'stat-reviews', 'stat-tasks'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '-';
    });
  }
  
  // Widget 3: Recent Projects
  let projects = [];
  try {
    projects = await Store.getProjects();
    const recentProjects = projects.slice(0, 4);
    const rpContainer = document.getElementById('recent-projects');
    if (rpContainer) {
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
    }
  } catch (err) {
    console.error('Failed to load recent projects:', err);
    const rpContainer = document.getElementById('recent-projects');
    if (rpContainer) {
      rpContainer.innerHTML = `<div class="p-3 text-center text-danger text-small">Failed to load projects: ${Utils.escapeHtml(err.message)}</div>`;
    }
  }
  
  // Widget 4: Upcoming Tasks
  try {
    const tasks = await Store.getTasks();
    const pending = tasks.filter(t => t.status !== 'completed').slice(0, 4);
    const taskContainer = document.getElementById('upcoming-tasks');
    if (taskContainer) {
      if (pending.length === 0) {
        UI.renderEmptyState('upcoming-tasks', 'All caught up', 'No pending tasks.', window.icon('check'));
      } else {
        taskContainer.innerHTML = pending.map(t => {
          const isOverdue = t.due_date && new Date(t.due_date) < new Date();
          const project = projects.find(p => p.id === t.project_id);
          const canEdit = t.canEdit !== undefined ? t.canEdit : (project && (project.userRole === 'owner' || project.userRole === 'collaborator'));
          return `
          <div class="list-item">
            <input type="checkbox" style="cursor:pointer;" ${canEdit ? '' : 'disabled title="You do not have permission to edit this task"'} onchange="completeTask('${t.id}', this)">
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
    }
  } catch (err) {
    console.error('Failed to load tasks:', err);
    const taskContainer = document.getElementById('upcoming-tasks');
    if (taskContainer) {
      taskContainer.innerHTML = `<div class="p-3 text-center text-danger text-small">Failed to load tasks: ${Utils.escapeHtml(err.message)}</div>`;
    }
  }
  
  // Widget 5: Recent Activity
  try {
    const activity = await Store.getRecentActivity();
    const actContainer = document.getElementById('recent-activity');
    if (actContainer) {
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
    }
  } catch (err) {
    console.error('Failed to load recent activity:', err);
    const actContainer = document.getElementById('recent-activity');
    if (actContainer) {
      actContainer.innerHTML = `<div class="p-3 text-center text-danger text-small">Failed to load activity: ${Utils.escapeHtml(err.message)}</div>`;
    }
  }
  
  // Widget 6: Pending Invitations
  try {
    const notifs = await Store.getNotifications();
    const invites = notifs.filter(n => n.type === 'invitation' && n.memberContext && n.memberContext.status === 'pending');
    const invSec = document.getElementById('invitations-section');
    if (invSec) {
      if (invites.length > 0) {
        invSec.style.display = 'block';
        const pendContainer = document.getElementById('pending-invitations');
        if (pendContainer) {
          pendContainer.innerHTML = invites.map(i => `
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
        }
      } else {
        invSec.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load notifications/invitations:', err);
  }
  
  // Widget 7: Fake Activity Chart
  try {
    const chartContainer = document.getElementById('chart-container');
    const labelsContainer = document.getElementById('chart-labels');
    if (chartContainer && labelsContainer) {
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
    }
  } catch (err) {
    console.error('Failed to render chart:', err);
  }
};

document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);

window.completeTask = async (id, cb) => {
   const prevChecked = cb.checked;
   cb.disabled = true;
   try {
     await Store.updateTask(id, { status: 'completed' });
     UI.toast('Task marked as completed', 'success');
     document.dispatchEvent(new Event('crh_user_changed'));
   } catch (err) {
     cb.checked = !prevChecked;
     cb.disabled = false;
     UI.toast(err.message, 'error');
   }
};

window.respondInvite = async (id, accept) => {
   try {
     await Store.respondToInvitation(id, accept);
     UI.toast(accept ? 'Invitation accepted' : 'Invitation rejected', 'success');
     document.dispatchEvent(new Event('crh_user_changed'));
   } catch (err) {
     UI.toast(err.message, 'error');
   }
};
