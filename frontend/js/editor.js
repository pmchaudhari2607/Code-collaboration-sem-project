document.addEventListener('DOMContentLoaded', async () => {
  const fileId = Utils.getQueryParam('file');
  const versionId = Utils.getQueryParam('version');
  
  if (!fileId) {
     window.location.href = 'projects.html';
     return;
  }
  
  let fileData;
  try {
     fileData = await Store.getFile(fileId);
  } catch (err) {
     alert('Access denied or file not found.');
     window.location.href = 'projects.html';
     return;
  }
  
  const project = await Store.getProject(fileData.project_id);
  
  document.getElementById('app-main').style.display = 'block';
  
  document.getElementById('crumb-project').textContent = project.name;
  document.getElementById('crumb-project').href = `project-details.html?id=${project.id}`;
  document.getElementById('crumb-file').textContent = fileData.file_name;
  document.getElementById('badge-lang').innerHTML = UI.getLanguageBadge(fileData.language);
  document.getElementById('badge-role').innerHTML = UI.getRoleBadge(project.userRole);
  
  const versions = await Store.getVersions(fileId);
  let activeVersion = versions.find(v => v.id === versionId) || versions[0];
  const isLatestVersion = activeVersion.id === versions[0].id;
  
  document.getElementById('badge-version').innerHTML = `<span class="badge badge-neutral">v${activeVersion.version_number}</span>`;
  
  if (!isLatestVersion) {
     document.getElementById('read-only-banner').style.display = 'block';
     document.getElementById('banner-text').textContent = `Viewing Version ${activeVersion.version_number} (read-only).`;
     document.getElementById('read-only-overlay').style.display = 'block';
  }
  
  document.getElementById('btn-return-current').addEventListener('click', (e) => {
     e.preventDefault();
     window.location.href = `code-editor.html?file=${fileId}`;
  });

  const cmMode = fileData.language === 'Python' ? 'python' : (fileData.language === 'Java' ? 'text/x-java' : 'text/x-csrc');
  const cmTheme = document.body.classList.contains('theme-dark') ? 'material-darker' : 'default';
  
  const editor = CodeMirror.fromTextArea(document.getElementById('code-textarea'), {
     lineNumbers: true,
     mode: cmMode,
     theme: cmTheme,
     readOnly: !isLatestVersion || project.userRole === 'viewer',
     styleActiveLine: true,
     gutters: ["CodeMirror-linenumbers", "review-gutter"]
  });
  
  editor.setValue(activeVersion.code_content);
  
  let originalCode = activeVersion.code_content;
  
  if (isLatestVersion && project.userRole !== 'viewer') {
     editor.on('change', () => {
        const currentCode = editor.getValue();
        const hasChanges = currentCode !== originalCode;
        document.getElementById('unsaved-dot').style.display = hasChanges ? 'inline-block' : 'none';
        document.getElementById('btn-save').disabled = !hasChanges;
        document.getElementById('btn-save-new').disabled = !hasChanges;
     });
     
     document.getElementById('btn-save').addEventListener('click', async () => {
        const code = editor.getValue();
        document.getElementById('btn-save').disabled = true;
        await Store.updateFile(fileId, { current_code: code });
        originalCode = code;
        document.getElementById('unsaved-dot').style.display = 'none';
        document.getElementById('btn-save').disabled = true;
        document.getElementById('btn-save-new').disabled = true;
        UI.toast('Draft saved', 'success');
     });
     
     document.getElementById('btn-save-new').addEventListener('click', () => {
        document.getElementById('version-note').value = '';
        UI.openModal('modal-save-version');
     });
     
     document.getElementById('form-save-version').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = editor.getValue();
        const note = document.getElementById('version-note').value.trim();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        try {
           await Store.createVersion(fileId, code, note);
           UI.toast('New version created', 'success');
           setTimeout(() => { window.location.reload(); }, 500);
        } catch(err) {
           UI.toast(err.message, 'error');
           btn.disabled = false;
        }
     });
  }

  document.getElementById('info-name').textContent = fileData.file_name;
  document.getElementById('info-lang').textContent = fileData.language;
  document.getElementById('info-creator').textContent = fileData.creatorName;
  document.getElementById('info-created').textContent = Utils.formatDate(fileData.created_at);
  document.getElementById('info-updated').textContent = Utils.formatDate(fileData.updated_at);

  document.getElementById('versions-list').innerHTML = versions.map(v => `
     <a href="code-editor.html?file=${fileId}&version=${v.id}" class="card mb-2" style="display:block; text-decoration:none; color:inherit; ${v.id === activeVersion.id ? 'border-color:var(--accent);' : ''}">
        <div class="d-flex justify-content-between align-items-center mb-1">
           <span class="text-bold">Version ${v.version_number}</span>
           ${v.id === activeVersion.id ? '<span class="badge badge-accent">Viewing</span>' : ''}
        </div>
        <div class="text-small text-muted mb-1">${Utils.formatDate(v.created_at)} by ${Utils.escapeHtml(v.creatorName)}</div>
        ${v.commit_message ? `<div class="text-small">${Utils.escapeHtml(v.commit_message)}</div>` : ''}
     </a>
  `).join('');

  let reviews = [];
  let markers = [];
  let showClosed = false;
  
  const loadReviews = async () => {
     reviews = await Store.getReviews({ fileId, versionId: activeVersion.id });
     renderReviews();
     renderReviewMarkers();
  };
  
  const renderReviews = () => {
     let filtered = reviews.filter(r => showClosed || r.status === 'open');
     filtered.sort((a,b) => a.line_number - b.line_number);
     
     const container = document.getElementById('reviews-list');
     document.getElementById('reviews-count').textContent = `${filtered.length} Reviews`;
     
     if (filtered.length === 0) {
         container.innerHTML = `<div class="text-center text-muted py-4">No reviews to show.</div>`;
         return;
     }
     
     container.innerHTML = filtered.map(r => `
       <div class="review-card" id="rev-card-${r.id}" onclick="focusReview('${r.id}', ${r.line_number})">
          <div class="d-flex justify-content-between align-items-center mb-2">
             <div class="d-flex gap-2 align-items-center">
                ${UI.getAvatarHtml(r.reviewerName)}
                <div class="text-bold text-small">${Utils.escapeHtml(r.reviewerName)}</div>
             </div>
             <div class="text-small text-muted">Line ${r.line_number}</div>
          </div>
          <div class="mb-2">
             ${UI.getReviewTypeBadge(r.review_type)}
             ${UI.getReviewStatusBadge(r.status)}
          </div>
          <p class="text-small m-0 mb-2" style="line-height:1.4;">${Utils.escapeHtml(r.comment)}</p>
          
          <div class="d-flex gap-1" style="border-top:1px solid var(--border); padding-top:8px; margin-top:8px;">
             ${r.status === 'open' && (Store.getCurrentUserId() === r.reviewer_id || project.userRole === 'owner') ? 
               `<button class="btn btn-ghost text-small text-success" style="flex:1;" onclick="event.stopPropagation(); resolveReview('${r.id}')">${window.icon('check')} Resolve</button>` : ''}
             
             ${r.status === 'open' && project.userRole !== 'viewer' ? 
               `<button class="btn btn-ghost text-small" style="flex:1;" onclick="event.stopPropagation(); openTaskModal('${r.id}', '${Utils.escapeHtml(r.comment.substring(0,30))}')">${window.icon('checkSquare')} Make Task</button>` : ''}
          </div>
       </div>
     `).join('');
  };
  
  const renderReviewMarkers = () => {
     markers.forEach(m => editor.removeLineWidget(m));
     editor.clearGutter("review-gutter");
     markers = [];
     
     let filtered = reviews.filter(r => showClosed || r.status === 'open');
     
     const byLine = {};
     filtered.forEach(r => {
        if(!byLine[r.line_number]) byLine[r.line_number] = [];
        byLine[r.line_number].push(r);
     });
     
     Object.keys(byLine).forEach(lineStr => {
        const line = parseInt(lineStr) - 1;
        const lineReviews = byLine[lineStr];
        
        let marker = document.createElement("div");
        marker.className = `review-marker ${lineReviews[0].review_type}`;
        marker.textContent = lineReviews.length;
        marker.title = `${lineReviews.length} reviews`;
        marker.onclick = () => {
           document.querySelector('.tab[data-tab="reviews"]').click();
           const firstId = lineReviews[0].id;
           focusReview(firstId, parseInt(lineStr));
        };
        editor.setGutterMarker(line, "review-gutter", marker);
     });
  };
  
  window.focusReview = (id, line) => {
     document.querySelectorAll('.review-card').forEach(c => c.classList.remove('active'));
     const card = document.getElementById(`rev-card-${id}`);
     if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
     }
     editor.scrollIntoView({line: line-1, ch: 0}, 200);
     editor.setCursor({line: line-1, ch: 0});
  };
  
  window.resolveReview = async (id) => {
     await Store.updateReviewStatus(id, 'resolved');
     UI.toast('Review resolved', 'success');
     loadReviews();
  };
  
  document.getElementById('toggle-closed-reviews').addEventListener('change', (e) => {
     showClosed = e.target.checked;
     renderReviews();
     renderReviewMarkers();
  });
  
  if (project.userRole !== 'viewer') {
      editor.on("gutterClick", (cm, line, gutter, e) => {
          if (gutter === "CodeMirror-linenumbers") {
             openAddReview(line);
          }
      });
      editor.on("renderLine", (cm, line, elt) => {
          let addBtn = document.createElement("div");
          addBtn.className = "cm-line-add-review";
          addBtn.innerHTML = "+";
          addBtn.title = "Add Review";
          addBtn.onclick = () => openAddReview(line.lineNo());
          elt.prepend(addBtn);
      });
  }
  
  let currentReviewLine = null;
  let currentReviewType = 'comment';
  
  const openAddReview = (line) => {
      document.querySelector('.tab[data-tab="reviews"]').click();
      document.getElementById('add-review-container').style.display = 'block';
      currentReviewLine = line + 1;
      document.getElementById('add-review-line').textContent = `Line ${currentReviewLine}`;
      document.getElementById('add-review-code').textContent = editor.getLine(line).trim() || ' ';
      document.getElementById('review-comment').value = '';
      document.getElementById('review-comment').focus();
  };
  
  window.closeAddReview = () => {
      document.getElementById('add-review-container').style.display = 'none';
  };
  
  document.querySelectorAll('#review-type-segments .segment-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          document.querySelectorAll('#review-type-segments .segment-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          currentReviewType = e.target.getAttribute('data-val');
      });
  });
  
  document.getElementById('form-add-review').addEventListener('submit', async (e) => {
      e.preventDefault();
      const comment = document.getElementById('review-comment').value.trim();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      
      try {
         await Store.createReview({
            file_id: fileId,
            version_id: activeVersion.id,
            line_number: currentReviewLine,
            review_type: currentReviewType,
            comment: comment
         });
         UI.toast('Review added', 'success');
         closeAddReview();
         loadReviews();
      } catch (err) {
         UI.toast(err.message, 'error');
      } finally {
         btn.disabled = false;
      }
  });
  
  window.openTaskModal = async (reviewId, textPreview) => {
      document.getElementById('task-review-id').value = reviewId;
      document.getElementById('task-title').value = `Address review: ${textPreview}...`;
      
      const select = document.getElementById('task-assignee');
      select.innerHTML = '<option value="">Unassigned</option>' + project.members.map(m => `<option value="${m.user_id}">${m.user_full_name}</option>`).join('');
      
      const d = new Date(); d.setDate(d.getDate()+1);
      document.getElementById('task-due').value = d.toISOString().split('T')[0];
      
      UI.openModal('modal-create-task');
  };
  
  document.getElementById('form-create-task').addEventListener('submit', async (e) => {
      e.preventDefault();
      const revId = document.getElementById('task-review-id').value;
      const title = document.getElementById('task-title').value.trim();
      const desc = document.getElementById('task-desc').value.trim();
      const assigneeId = document.getElementById('task-assignee').value;
      const priority = document.getElementById('task-priority').value;
      const due = document.getElementById('task-due').value;
      
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      
      try {
         await Store.createTask(project.id, {
            title, description: desc, assignee_id: assigneeId, priority, due_date: due
         });
         await Store.updateReviewStatus(revId, 'resolved');
         UI.toast('Task created and review resolved', 'success');
         UI.closeModal('modal-create-task');
         loadReviews();
      } catch (err) {
         UI.toast(err.message, 'error');
      } finally {
         btn.disabled = false;
      }
  });
  
  document.querySelectorAll('#panel-tabs .tab').forEach(tab => {
     tab.addEventListener('click', (e) => {
        document.querySelectorAll('#panel-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(`panel-${tabId}`).style.display = 'block';
     });
  });

  loadReviews();
});
