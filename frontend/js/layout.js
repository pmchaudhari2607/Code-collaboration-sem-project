const Layout = {
  init: async () => {
    const isAuthPage = window.location.pathname.includes('login') || window.location.pathname.includes('register');
    const hasToken = !!Store.token;
    
    if (!isAuthPage && !hasToken) {
      window.location.href = 'login.html';
      return;
    }

    const isDark = localStorage.getItem('crh_theme') === 'dark';
    if (isDark) document.body.classList.add('theme-dark');
    
    if (isAuthPage) return;
    
    await Layout.renderShell();
    Layout.bindEvents();
    Layout.updateNotificationsBadge();
    
    if (window.hydrateIcons) window.hydrateIcons();
    setTimeout(() => {
       if (document.body.innerText.includes('${')) {
           const idx = document.body.innerText.indexOf('${');
           console.error("Unrendered template placeholder found: ", document.body.innerText.substring(idx - 10, idx + 40));
       }
    }, 500);
  },
  
  renderShell: async () => {
    let user = null;
    try {
      user = await Store.getCurrentUser();
    } catch (e) {
      console.warn('Failed to fetch current user:', e);
    }
    
    if (!user) {
      Store.setToken(null);
      localStorage.removeItem('crh_current_user');
      window.location.href = 'login.html';
      return;
    }
    localStorage.setItem('crh_current_user', JSON.stringify(user));
    
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    
    const sidebarHtml = `
      <div class="sidebar-header">
        ${window.icon ? window.icon('code') : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>'}
        <span style="font-weight:700; font-size:18px; letter-spacing:-0.3px;">CodeReviewHub</span>
      </div>
      <div class="sidebar-nav">
        <div>
          <div class="nav-group-title">Main</div>
          <a href="dashboard.html" class="nav-item ${location.pathname.includes('dashboard')?'active':''}">${window.icon('home')} <span>Dashboard</span></a>
          <a href="projects.html" class="nav-item ${location.pathname.includes('project') && !location.pathname.includes('editor')?'active':''}">${window.icon('folder')} <span>Projects</span></a>
          <a href="tasks.html" class="nav-item ${location.pathname.includes('tasks')?'active':''}">${window.icon('check')} <span>Tasks</span></a>
          <a href="reviews.html" class="nav-item ${location.pathname.includes('reviews')?'active':''}">${window.icon('messageSquare')} <span>Reviews</span></a>
          <a href="team.html" class="nav-item ${location.pathname.includes('team')?'active':''}">${window.icon('users')} <span>Team</span></a>
          <a href="analytics.html" class="nav-item ${location.pathname.includes('analytics')?'active':''}">${window.icon('pieChart')} <span>Analytics</span></a>
          <a href="messages.html" class="nav-item ${location.pathname.includes('messages')?'active':''}">${window.icon('messageSquare')} <span>Messages</span></a>
          <a href="calendar.html" class="nav-item ${location.pathname.includes('calendar')?'active':''}">${window.icon('calendar')} <span>Calendar</span></a>
        </div>
        <div>
          <div class="nav-group-title">Account</div>
          <a href="notifications.html" class="nav-item ${location.pathname.includes('notification')?'active':''}">${window.icon('bell')} <span>Notifications</span> <span id="sidebar-notif-badge" class="badge badge-accent" style="margin-left:auto; display:none;">0</span></a>
          <a href="profile.html" class="nav-item ${location.pathname.includes('profile')?'active':''}">${window.icon('user')} <span>Profile</span></a>
          <a href="settings.html" class="nav-item ${location.pathname.includes('settings')?'active':''}">${window.icon('settings')} <span>Settings</span></a>
          <a href="#" id="btn-logout" class="nav-item">${window.icon('logOut')} <span>Logout</span></a>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="d-flex align-items-center gap-2 user-info">
          ${UI.getAvatarHtml(user.full_name)}
          <div style="min-width:0; overflow:hidden;">
            <div class="text-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis; color:var(--sidebar-text); font-size:13px;">${Utils.escapeHtml(user.full_name)}</div>
            <div class="text-small" style="color:var(--sidebar-muted); font-size:11px;">@${Utils.escapeHtml(user.username)}</div>
          </div>
        </div>
      </div>
    `;
    
    let sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = sidebarHtml;
    
    const topbarHtml = `
      <div class="topbar-left">
        <button id="btn-mobile-menu" class="btn-ghost" style="display:none;" aria-label="Toggle menu">${window.icon('menu')}</button>
        <div class="search-container" style="position:relative; width: 320px;">
          <div style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-secondary); width:16px; pointer-events:none;">${window.icon('search')}</div>
          <input type="text" id="global-search" class="form-control" placeholder="Search for projects, files, tasks..." style="padding-left:36px; border-radius:var(--radius-pill); font-size:13px;">
          <div id="search-results" class="card" style="display:none; position:absolute; top:100%; left:0; right:0; margin-top:8px; padding:12px; max-height:400px; overflow-y:auto; z-index:100; box-shadow:var(--shadow-card-hover);"></div>
        </div>
      </div>
      <div class="topbar-right">
        <button id="btn-theme-toggle" class="btn-ghost" title="Toggle theme" aria-label="Toggle theme">
          ${document.body.classList.contains('theme-dark') ? window.icon('sun') : window.icon('moon')}
        </button>
        <div style="position:relative;">
          <button id="btn-notif" class="btn-ghost" title="Notifications" aria-label="Notifications">
             ${window.icon('bell')}
             <span id="topbar-notif-badge" style="position:absolute; top:4px; right:4px; width:8px; height:8px; background:var(--danger-text); border-radius:50%; display:none;"></span>
          </button>
        </div>
        <a href="profile.html" title="View Profile" style="display:flex; align-items:center; text-decoration:none;">
          ${UI.getAvatarHtml(user.full_name)}
        </a>
      </div>
    `;
    
    let topbar = document.createElement('div');
    topbar.className = 'topbar';
    topbar.innerHTML = topbarHtml;
    
    const existingSidebar = appContainer.querySelector('.sidebar');
    if (existingSidebar) existingSidebar.remove();
    appContainer.prepend(sidebar);
    
    const mainContent = appContainer.querySelector('.main-content');
    if (mainContent) {
      const existingTopbar = mainContent.querySelector('.topbar');
      if (existingTopbar) existingTopbar.remove();
      mainContent.prepend(topbar);
    }
    
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    if (window.innerWidth < 768 && mobileMenuBtn) {
       mobileMenuBtn.style.display = 'block';
    }
  },
  
  bindEvents: () => {
    document.getElementById('btn-logout')?.addEventListener('click', (e) => {
      e.preventDefault();
      Store.setToken(null);
      localStorage.removeItem('crh_current_user');
      window.location.href = 'login.html';
    });
    
    document.getElementById('btn-theme-toggle')?.addEventListener('click', (e) => {
      const isDark = document.body.classList.toggle('theme-dark');
      localStorage.setItem('crh_theme', isDark ? 'dark' : 'light');
      e.currentTarget.innerHTML = isDark ? window.icon('sun') : window.icon('moon');
    });
    
    document.getElementById('btn-mobile-menu')?.addEventListener('click', () => {
       document.querySelector('.sidebar')?.classList.toggle('open');
    });
    
    const searchInput = document.getElementById('global-search');
    const searchResults = document.getElementById('search-results');
    if (searchInput && searchResults) {
      searchInput.addEventListener('input', Utils.debounce(async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) {
          searchResults.style.display = 'none';
          return;
        }
        
        const res = await Store.globalSearch(q);
        let html = '';
        if (res.projects.length) {
           html += `<div class="nav-group-title mt-2">Projects</div>`;
           res.projects.forEach(p => html += `<a href="project-details.html?id=${p.id}" style="display:block; padding:8px; border-radius:4px; margin-bottom:4px; color:inherit;" class="nav-item">${p.name}</a>`);
        }
        if (res.files.length) {
           html += `<div class="nav-group-title mt-2">Files</div>`;
           res.files.forEach(f => html += `<a href="code-editor.html?file=${f.id}" style="display:block; padding:8px; border-radius:4px; margin-bottom:4px; color:inherit;" class="nav-item">${f.file_name} <span class="text-small text-muted">in ${f.projectName}</span></a>`);
        }
        if (res.users.length) {
           html += `<div class="nav-group-title mt-2">Users</div>`;
           res.users.forEach(u => html += `<div style="display:flex; align-items:center; gap:8px; padding:8px;"><div class="avatar" style="width:24px;height:24px;font-size:10px;background-color:${Utils.getAvatarColor(u.full_name)}">${Utils.getInitials(u.full_name)}</div>${u.full_name}</div>`);
        }
        
        if (!html) html = `<div class="text-muted text-center" style="padding:16px;">No results found</div>`;
        searchResults.innerHTML = html;
        searchResults.style.display = 'block';
      }, 300));
      
      document.addEventListener('click', (e) => {
         if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
         }
      });
    }
    
    document.getElementById('btn-notif')?.addEventListener('click', () => {
       window.location.href = 'notifications.html';
    });
  },
  
  updateNotificationsBadge: async () => {
    try {
      const notifs = await Store.getNotifications();
      const unread = notifs.filter(n => !n.is_read).length;
      const sBadge = document.getElementById('sidebar-notif-badge');
      const tBadge = document.getElementById('topbar-notif-badge');
      if (unread > 0) {
         if (sBadge) { sBadge.style.display = 'inline-block'; sBadge.textContent = unread; }
         if (tBadge) tBadge.style.display = 'block';
      } else {
         if (sBadge) sBadge.style.display = 'none';
         if (tBadge) tBadge.style.display = 'none';
      }
    } catch (e) {
      // quiet fail for badge
    }
  }
};

document.addEventListener('DOMContentLoaded', Layout.init);
document.addEventListener('crh_user_changed', Layout.updateNotificationsBadge);
