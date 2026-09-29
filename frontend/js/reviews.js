const _pageRender = async () => {
    const projects = await Store.getProjects();
    const filterProj = document.getElementById('filter-project');
    projects.forEach(p => {
       const opt = document.createElement('option');
       opt.value = p.id;
       opt.textContent = p.name;
       filterProj.appendChild(opt);
    });

    const loadReviews = async () => {
        const tbody = document.querySelector('#table-reviews tbody');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Loading...</td></tr>';
        
        const projId = filterProj.value === 'all' ? null : filterProj.value;
        const status = document.getElementById('filter-status').value;
        
        try {
            let reviews = await Store.getReviews({ projectId: projId });
            
            if (status !== 'all') {
                reviews = reviews.filter(r => r.status === status);
            }
            
            if (reviews.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No reviews found matching the filters.</td></tr>';
                return;
            }
            
            tbody.innerHTML = reviews.map(r => `
               <tr>
                  <td class="text-bold">${Utils.escapeHtml(r.projectName)}</td>
                  <td>${Utils.escapeHtml(r.fileName)} <span class="text-small text-muted">L${r.line_number}</span></td>
                  <td>${UI.getReviewTypeBadge(r.review_type)}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                       ${UI.getAvatarHtml(r.reviewerName)}
                       <span>${Utils.escapeHtml(r.reviewerName)}</span>
                    </div>
                  </td>
                  <td>${UI.getReviewStatusBadge(r.status)}</td>
                  <td>${Utils.formatDate(r.created_at)}</td>
                  <td><a href="code-editor.html?file=${r.file_id}" class="btn btn-secondary text-small">View</a></td>
               </tr>
            `).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">${e.message}</td></tr>`;
        }
    };
    
    filterProj.addEventListener('change', loadReviews);
    document.getElementById('filter-status').addEventListener('change', loadReviews);
    
    loadReviews();
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
