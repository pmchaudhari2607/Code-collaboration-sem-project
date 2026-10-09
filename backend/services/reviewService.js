const store = require('../data/store');
const { getRoleForUser } = require('../middleware/permissionMiddleware');

exports.listByFile = (fileId, versionId) => {
  let reviews = store.filter('reviews', r => r.file_id === fileId);
  if (versionId) {
      reviews = reviews.filter(r => r.version_id === versionId);
  }
  return reviews.map(r => ({ ...r, reviewerName: store.findById('users', r.reviewer_id)?.full_name || 'Unknown' }));
};

exports.create = (fileId, data, userId) => {
  const file = store.findById('code_files', fileId);
  
  const newReview = store.insert('reviews', {
    id: 'r' + Date.now(),
    file_id: fileId,
    version_id: data.version_id,
    line_number: data.line_number,
    review_type: data.review_type,
    comment: data.comment,
    status: 'open',
    reviewer_id: userId,
    created_at: new Date().toISOString()
  });
  
  store.insert('activity', { id: 'a' + Date.now(), project_id: file.project_id, user_id: userId, action_text: `added a review on ${file.file_name}.`, created_at: new Date().toISOString() });
  
  if (file.created_by !== userId) {
      const actor = store.findById('users', userId);
      store.insert('notifications', {
          id: 'n' + Date.now(), user_id: file.created_by, type: 'review',
          message: `${actor.full_name} left a review on your file ${file.file_name}`,
          reference_id: newReview.id, project_id: file.project_id, is_read: false, created_at: new Date().toISOString()
      });
  }
  return newReview;
};

exports.listAll = (userId, projectId) => {
  const allProjects = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  let projectIds = allProjects.map(p => p.id);
  if (projectId) {
      if (!projectIds.includes(projectId)) return [];
      projectIds = [projectId];
  }
  
  const files = store.filter('code_files', f => projectIds.includes(f.project_id));
  const fileIds = files.map(f => f.id);
  
  const reviews = store.filter('reviews', r => fileIds.includes(r.file_id));
  return reviews.map(r => {
      const file = files.find(f => f.id === r.file_id);
      const project = allProjects.find(p => p.id === file.project_id);
      return {
          ...r,
          projectName: project.name,
          fileName: file.file_name,
          reviewerName: store.findById('users', r.reviewer_id)?.full_name || 'Unknown'
      };
  });
};

exports.updateStatus = (reviewId, status, userId) => {
  const review = store.findById('reviews', reviewId);
  if (!review) { const err = new Error('Review not found'); err.statusCode = 404; throw err; }
  const file = store.findById('code_files', review.file_id);
  const role = getRoleForUser(file.project_id, userId);

  if (status === 'closed') {
    if (role !== 'owner') {
      const err = new Error('Only the project owner can close a review.');
      err.statusCode = 403;
      throw err;
    }
  } else if (status === 'resolved' || status === 'reopened') {
    if (role !== 'owner' && role !== 'collaborator') {
      const err = new Error('You do not have permission to change this review\'s status.');
      err.statusCode = 403;
      throw err;
    }
  } else {
    const err = new Error('Invalid status value.');
    err.statusCode = 400;
    throw err;
  }

  const updated = store.update('reviews', reviewId, { status, updated_at: new Date().toISOString() });
  store.insert('activity', { id: 'a' + Date.now(), project_id: file.project_id, user_id: userId, action_text: `marked a review as ${status}.`, created_at: new Date().toISOString() });
  return updated;
};
