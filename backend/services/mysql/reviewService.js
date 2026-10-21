const reviewModel = require('../../models/reviewModel');
const fileModel = require('../../models/fileModel');
const versionModel = require('../../models/versionModel');
const memberModel = require('../../models/memberModel');
const notificationModel = require('../../models/notificationModel');
const userModel = require('../../models/userModel');
const { withTransaction } = require('../../db/transaction');

exports.listByFile = async (fileId, versionId = null) => {
  return reviewModel.listByFile(fileId, versionId);
};

exports.listAll = async (userId, projectId = null) => {
  return reviewModel.listAll(userId, projectId);
};

exports.create = async (fileId, data, userId) => {
  const file = await fileModel.findById(fileId);
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

  let versionId = data.version_id;
  if (versionId) {
    const version = await versionModel.findById(versionId);
    if (!version || version.file_id !== fileId) {
      const err = new Error('version_id must exist and belong to this file');
      err.statusCode = 400;
      throw err;
    }
  }

  return withTransaction(async (conn) => {
    const newReview = await reviewModel.create(
      fileId,
      versionId,
      userId,
      lineNumber,
      data.review_type,
      comment,
      conn
    );

    if (file.created_by && file.created_by !== userId) {
      const actor = await userModel.findById(userId, conn);
      const actorName = actor ? actor.full_name : 'Someone';
      await notificationModel.create({
        user_id: file.created_by,
        type: 'review',
        message: `${actorName} left a review on your file ${file.file_name}`,
        reference_id: newReview.id,
        project_id: file.project_id,
        is_read: false
      }, conn);
    }

    return newReview;
  });
};

exports.updateStatus = async (reviewId, status, userId) => {
  const review = await reviewModel.findById(reviewId);
  if (!review) {
    const err = new Error('Review not found');
    err.statusCode = 404;
    throw err;
  }

  const projectId = await reviewModel.getProjectId(reviewId);
  const role = await memberModel.getRole(projectId, userId);

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
    const err = new Error(`A review cannot move from ${curr} to ${target}.`);
    err.statusCode = 409;
    throw err;
  }

  const result = await reviewModel.updateStatus(reviewId, curr, target, {
    resolved_by: userId,
    closed_by: userId,
    user_id: userId
  });

  if (result.outcome !== 'success') {
    const err = new Error(`A review cannot move from ${curr} to ${target}.`);
    err.statusCode = 409;
    throw err;
  }

  return reviewModel.findById(reviewId);
};
