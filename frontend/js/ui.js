const UI = {
  toast: (message, type = 'info') => {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = window.icon('info');
    if (type === 'success') icon = window.icon('check');
    if (type === 'error') icon = window.icon('x');
    
    toast.innerHTML = `
      <div class="d-flex align-items-center gap-1">
        ${icon}
        <span>${Utils.escapeHtml(message)}</span>
      </div>
      <button class="btn-ghost" onclick="this.parentElement.remove()">
        ${window.icon('x')}
      </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4000);
  },
  
  openModal: (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      const focusable = modal.querySelector('input, textarea, button:not(.modal-close)');
      if (focusable) focusable.focus();
      
      // Setup esc listener
      const escListener = (e) => {
        if (e.key === 'Escape') {
          UI.closeModal(modalId);
          document.removeEventListener('keydown', escListener);
        }
      };
      document.addEventListener('keydown', escListener);
    }
  },
  
  closeModal: (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
  },
  
  confirmDialog: (title, message, confirmText = 'Confirm', type = 'primary') => {
    return new Promise((resolve) => {
      let modalBg = document.createElement('div');
      modalBg.className = 'modal-backdrop open';
      modalBg.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">${Utils.escapeHtml(title)}</h3>
            <button class="modal-close">${window.icon('x')}</button>
          </div>
          <div class="modal-body">
            <p>${Utils.escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary cancel-btn">Cancel</button>
            <button class="btn btn-${type} confirm-btn">${Utils.escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modalBg);
      
      const close = () => {
        modalBg.classList.remove('open');
        setTimeout(() => modalBg.remove(), 200);
        resolve(false);
      };
      
      modalBg.querySelector('.cancel-btn').onclick = close;
      modalBg.querySelector('.modal-close').onclick = close;
      modalBg.querySelector('.confirm-btn').onclick = () => {
        modalBg.classList.remove('open');
        setTimeout(() => modalBg.remove(), 200);
        resolve(true);
      };
    });
  },
  
  renderEmptyState: (containerId, title, subtitle, iconHtml, actionHtml = '') => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state">
        ${iconHtml}
        <h3 class="empty-title">${Utils.escapeHtml(title)}</h3>
        <p class="empty-subtitle">${Utils.escapeHtml(subtitle)}</p>
        ${actionHtml}
      </div>
    `;
  },
  
  renderSkeleton: (containerId, rows = 3) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '';
    for (let i = 0; i < rows; i++) {
      html += `<div class="skeleton" style="height: 48px; margin-bottom: 12px; width: 100%;"></div>`;
    }
    container.innerHTML = html;
  },
  
  getAvatarHtml: (name) => {
    const color = Utils.getAvatarColor(name);
    const initials = Utils.getInitials(name);
    return `<div class="avatar" style="background-color: ${color};" title="${Utils.escapeHtml(name)}">${initials}</div>`;
  },
  
  getLanguageBadge: (lang) => {
    const colors = {
      'C': { bg: '#E2E8F0', text: '#334155' },
      'Java': { bg: '#FEE2E2', text: '#991B1B' },
      'Python': { bg: '#FEF3C7', text: '#92400E' }
    };
    const style = colors[lang] || { bg: '#E2E8F0', text: '#334155' };
    return `<span class="badge" style="background-color: ${style.bg}; color: ${style.text};">${Utils.escapeHtml(lang)}</span>`;
  },
  
  getReviewTypeBadge: (type) => {
    const types = {
      'comment': { cls: 'info', icon: window.icon('messageSquare'), label: 'Comment' },
      'suggestion': { cls: 'warning', icon: window.icon('lightbulb'), label: 'Suggestion' },
      'bug': { cls: 'danger', icon: window.icon('bug'), label: 'Bug' },
      'improvement': { cls: 'success', icon: window.icon('sparkles'), label: 'Improvement' }
    };
    const t = types[type.toLowerCase()] || types['comment'];
    return `<span class="badge badge-${t.cls}">${t.icon} ${t.label}</span>`;
  },
  
  getReviewStatusBadge: (status) => {
    const statuses = {
      'open': { cls: 'warning', label: 'Open' },
      'resolved': { cls: 'success', label: 'Resolved' },
      'closed': { cls: 'neutral', label: 'Closed' },
      'reopened': { cls: 'danger', label: 'Reopened' }
    };
    const s = statuses[status.toLowerCase()] || statuses['open'];
    return `<span class="badge badge-${s.cls}">${s.label}</span>`;
  },
  
  getPriorityBadge: (priority) => {
    const p = {
      'high': { cls: 'danger', label: 'High' },
      'medium': { cls: 'warning', label: 'Medium' },
      'low': { cls: 'neutral', label: 'Low' }
    };
    const pr = p[priority.toLowerCase()] || p['low'];
    return `<span class="badge badge-${pr.cls}">${pr.label}</span>`;
  },

  getRoleBadge: (role) => {
    const roles = {
      'owner': { cls: 'accent', label: 'Owner' },
      'collaborator': { cls: 'info', label: 'Collaborator' },
      'viewer': { cls: 'neutral', label: 'Viewer' }
    };
    const r = roles[role?.toLowerCase()] || roles['viewer'];
    return `<span class="badge badge-${r.cls}">${r.label}</span>`;
  }
};
window.UI = UI;
