const store = require('../../data/store');
const { getRoleForUser } = require('./roles');
const { newId } = require('../../utils/id');

exports.listByFile = (fileId, versionId) => {
  let reviews = store.filter('reviews', r => r.file_id === fileId);
  if (versionId) {
      reviews = reviews.filter(r => r.version_id === versionId);
  }
  return reviews.map(r => ({ ...r, reviewerName: store.findById('users', r.reviewer_id)?.full_name || 'Unknown' }));
};

exports.create = (fileId, data, userId) => {
  const file = store.findById('code_files', fileId);
  if (!file) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }

  if (!['comment', 'suggestion', 'bug', 'improvement'].includes(data.review_type)) {
    const err = new Error('Invalid review_type. Must be one of comment, suggestion, bug, improvement.');
    err.statusCode = 400;
    throw err;
  }

  const lineNumber = Number(data.line_number);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    const err = new Error('line_number must be an integer >= 1');
    err.statusCode = 400;
    throw err;
  }

  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (comment.length < 3) {
    const err = new Error('comment must be at least 3 characters');
    err.statusCode = 400;
    throw err;
  }

  const version = store.findById('code_versions', data.version_id);
  if (!version || version.file_id !== fileId) {
    const err = new Error('version_id must exist and belong to this file');
    err.statusCode = 400;
    throw err;
  }
  
  const now = new Date().toISOString();
  const newReview = store.insert('reviews', {
    id: newId('r'),
    file_id: fileId,
    version_id: data.version_id,
    line_number: lineNumber,
    review_type: data.review_type,
    comment: comment,
    status: 'open',
    reviewer_id: userId,
    resolved_by: null,
    resolved_at: null,
    closed_by: null,
    closed_at: null,
    reopened_at: null,
    reopen_count: 0,
    created_at: now,
    updated_at: now
  });
  
  store.insert('activity', {
    id: newId('a'),
    project_id: file.project_id,
    user_id: userId,
    action_text: `added a review on ${file.file_name}.`,
    created_at: now
  });
  
  if (file.created_by !== userId) {
      const actor = store.findById('users', userId);
      store.insert('notifications', {
          id: newId('n'),
          user_id: file.created_by,
          type: 'review',
          message: `${actor.full_name} left a review on your file ${file.file_name}`,
          reference_id: newReview.id,
          project_id: file.project_id,
          is_read: false,
          created_at: now
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
  if (!review) {
    const err = new Error('Review not found');
    err.statusCode = 404;
    throw err;
  }
  const file = store.findById('code_files', review.file_id);
  const role = getRoleForUser(file.project_id, userId);

  const target = status === 'reopened' ? 'open' : status;
  if (!['open', 'resolved', 'closed'].includes(target)) {
    const err = new Error('Invalid status value.');
    err.statusCode = 400;
    throw err;
  }

  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error("You do not have permission to change this review's status.");
    err.statusCode = 403;
    throw err;
  }

  const curr = review.status;

  // Enforce transition rules and permissions:
  // open -> resolved: owner or collaborator
  // resolved -> open: owner or collaborator
  // resolved -> closed: owner only
  // closed -> open: owner only
  if (curr === 'open' && target === 'resolved') {
    // allowed for owner or collaborator
  } else if (curr === 'resolved' && target === 'open') {
    // allowed for owner or collaborator
  } else if (curr === 'resolved' && target === 'closed') {
    if (role !== 'owner') {
      const err = new Error('Only the project owner can close a review.');
      err.statusCode = 403;
      throw err;
    }
  } else if (curr === 'closed' && target === 'open') {
    if (role !== 'owner') {
      const err = new Error('Only the project owner can reopen a closed review.');
      err.statusCode = 403;
      throw err;
    }
  } else {
    // Anything else is rejected with 409
    const err = new Error(`A review cannot move from ${curr} to ${target}.`);
    err.statusCode = 409;
    throw err;
  }

  const now = new Date().toISOString();
  let patch = { status: target, updated_at: now };

  if (target === 'resolved') {
    patch.resolved_by = userId;
    patch.resolved_at = now;
  } else if (target === 'closed') {
    patch.closed_by = userId;
    patch.closed_at = now;
    // keeps existing resolved_by / resolved_at
  } else if (target === 'open') {
    // Reopen clears resolved_* and closed_*, sets reopened_at and increments reopen_count
    patch.resolved_by = null;
    patch.resolved_at = null;
    patch.closed_by = null;
    patch.closed_at = null;
    patch.reopened_at = now;
    patch.reopen_count = (review.reopen_count || 0) + 1;
  }

  const updated = store.update('reviews', reviewId, patch);
  store.insert('activity', {
    id: newId('a'),
    project_id: file.project_id,
    user_id: userId,
    action_text: `marked a review as ${target}.`,
    created_at: now
  });

  return updated;
};
