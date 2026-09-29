const _pageRender = async () => {
  UI.renderSkeleton('projects-grid', 3);
  
  if (Utils.getQueryParam('create') === 'true') {
     UI.openModal('modal-create-project');
  }

  let projects = [];
  try {
     projects = await Store.getProjects();
  } catch(e) {
     console.error(e);
  }
  
  let currentFilter = 'all';
  let searchQuery = '';

  const renderProjects = () => {
    const grid = document.getElementById('projects-grid');
    const uid = Store.getCurrentUserId();
    
    let filtered = projects.filter(p => {
       if (searchQuery && !p.name.toLowerCase().includes(searchQuery) && !p.description.toLowerCase().includes(searchQuery)) return false;
       if (currentFilter === 'owned') return p.owner_id === uid;
       if (currentFilter === 'shared') return p.owner_id !== uid && p.userRole === 'collaborator';
       if (currentFilter === 'public') return p.visibility === 'public';
       return true;
    });

    if (filtered.length === 0) {
       UI.renderEmptyState('projects-grid', 'No projects found', 'Try adjusting your filters or create a new project.', window.icon('folder'), '<button class="btn btn-primary" onclick="UI.openModal(\'modal-create-project\')">Create Project</button>');
       document.getElementById('projects-grid').style.display = 'block';
       return;
    }

    document.getElementById('projects-grid').style.display = 'grid';
    grid.innerHTML = filtered.map(p => {
      const visIcon = p.visibility === 'public' ? window.icon('globe') : window.icon('lock');
      return `
      <div class="card project-card">
        <div class="d-flex justify-content-between align-items-center mb-2">
           <div class="d-flex gap-1 align-items-center">
             ${UI.getLanguageBadge(p.category)}
             <span class="badge badge-neutral" style="display:flex;align-items:center;gap:4px;">${visIcon} <span style="text-transform:capitalize;">${p.visibility}</span></span>
           </div>
           ${UI.getRoleBadge(p.userRole)}
        </div>
        <div class="card-body">
           <h3 class="m-0"><a href="project-details.html?id=${p.id}" class="text-primary" style="color:inherit; text-decoration:none;">${Utils.escapeHtml(p.name)}</a></h3>
           <p class="project-desc">${Utils.escapeHtml(p.description) || 'No description provided.'}</p>
        </div>
        <div class="project-meta">
           <div style="display:flex; align-items:center; gap:4px;" title="Files">${window.icon('file')} ${p.filesCount}</div>
           <div style="display:flex; align-items:center; gap:4px;" title="Members">${window.icon('users')} ${p.membersCount}</div>
           <div style="display:flex; align-items:center; gap:4px; ${p.openReviewsCount > 0 ? 'color:var(--warning-text);' : ''}" title="Open Reviews">${window.icon('messageSquare')} ${p.openReviewsCount}</div>
        </div>
        <div class="mt-3">
           <a href="project-details.html?id=${p.id}" class="btn btn-secondary" style="width:100%;">Open Project</a>
        </div>
      </div>
    `}).join('');
  };

  renderProjects();

  document.querySelectorAll('.tab').forEach(tab => {
     tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.getAttribute('data-filter');
        renderProjects();
     });
  });

  document.getElementById('project-search').addEventListener('input', (e) => {
     searchQuery = e.target.value.toLowerCase();
     renderProjects();
  });

  document.getElementById('form-create-project').addEventListener('submit', async (e) => {
     e.preventDefault();
     const btn = e.target.querySelector('button[type="submit"]');
     btn.disabled = true;
     btn.textContent = 'Creating...';
     
     const data = {
        name: document.getElementById('proj-name').value.trim(),
        description: document.getElementById('proj-desc').value.trim(),
        category: document.getElementById('proj-lang').value,
        visibility: document.querySelector('input[name="proj-vis"]:checked').value
     };
     
     try {
       const newProject = await Store.createProject(data);
       UI.toast('Project created successfully', 'success');
       UI.closeModal('modal-create-project');
       setTimeout(() => {
          window.location.href = `project-details.html?id=${newProject.id}`;
       }, 500);
     } catch (err) {
       UI.toast(err.message, 'error');
       btn.disabled = false;
       btn.textContent = 'Create Project';
     }
  });
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
