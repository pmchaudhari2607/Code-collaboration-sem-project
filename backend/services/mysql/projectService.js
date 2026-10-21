const projectModel = require('../../models/projectModel');
const memberModel = require('../../models/memberModel');
const userModel = require('../../models/userModel');
const notificationModel = require('../../models/notificationModel');
const activityModel = require('../../models/activityModel');
const { withTransaction } = require('../../db/transaction');

exports.list = async (userId) => {
  return projectModel.listAccessible(userId);
};

exports.getById = async (id, userId) => {
  const project = await projectModel.findById(id, userId);
  if (!project) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  return project;
};

exports.create = async (userId, data) => {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    const err = new Error('Project name is required');
    err.statusCode = 400;
    throw err;
  }
  const visibility = data.visibility || 'public';
  if (!['public', 'private'].includes(visibility)) {
    const err = new Error('Invalid visibility');
    err.statusCode = 400;
    throw err;
  }
  const category = data.category || 'Mixed';
  if (!['C', 'Java', 'Python', 'Mixed'].includes(category)) {
    const err = new Error('Invalid category');
    err.statusCode = 400;
    throw err;
  }

  return projectModel.createWithTransaction({
    name,
    description: (data.description || '').trim(),
    visibility,
    category
  }, userId);
};

exports.update = async (id, data) => {
  const existing = await projectModel.findById(id);
  if (!existing) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};
  if (data.name !== undefined) {
    const trimmed = typeof data.name === 'string' ? data.name.trim() : '';
    if (!trimmed) {
      const err = new Error('Project name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    patch.name = trimmed;
  }
  if (data.description !== undefined) {
    patch.description = typeof data.description === 'string' ? data.description.trim() : '';
  }
  if (data.visibility !== undefined) {
    if (!['public', 'private'].includes(data.visibility)) {
      const err = new Error('Invalid visibility');
      err.statusCode = 400;
      throw err;
    }
    patch.visibility = data.visibility;
  }
  if (data.category !== undefined) {
    if (!['C', 'Java', 'Python', 'Mixed'].includes(data.category)) {
      const err = new Error('Invalid category');
      err.statusCode = 400;
      throw err;
    }
    patch.category = data.category;
  }

  return projectModel.update(id, patch);
};

exports.remove = async (id) => {
  const existing = await projectModel.findById(id);
  if (!existing) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }
  return projectModel.deleteWithTransaction(id);
};

exports.getActivity = async (projectId) => {
  return activityModel.listByProject(projectId);
};

exports.listMembers = async (projectId, userId) => {
  const role = await memberModel.getRole(projectId, userId);
  const isOwner = role === 'owner';
  return memberModel.listByProject(projectId, isOwner);
};

exports.inviteMember = async (projectId, data, inviterId) => {
  const project = await projectModel.findById(projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  const targetUserId = data.userId || data.user_id;
  if (!targetUserId) {
    const err = new Error('Target user is required');
    err.statusCode = 400;
    throw err;
  }

  const targetUser = await userModel.findById(targetUserId);
  if (!targetUser) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (targetUserId === inviterId) {
    const err = new Error('Cannot invite yourself');
    err.statusCode = 400;
    throw err;
  }

  if (project.owner_id === targetUserId) {
    const err = new Error('Owner cannot be invited');
    err.statusCode = 400;
    throw err;
  }

  const existingMember = await memberModel.findByProjectAndUser(projectId, targetUserId);
  if (existingMember) {
    if (existingMember.status === 'accepted') {
      const err = new Error('User is already a member of this project');
      err.statusCode = 409;
      throw err;
    }
    if (existingMember.status === 'pending') {
      const err = new Error('An invitation is already pending for this user');
      err.statusCode = 409;
      throw err;
    }
    if (existingMember.status === 'rejected') {
      return withTransaction(async (conn) => {
        await memberModel.reInvite(existingMember.id, inviterId, conn);
        const updated = await memberModel.findById(existingMember.id, conn);

        await notificationModel.create({
          user_id: targetUserId,
          type: 'invitation',
          message: `You have been invited to collaborate on ${project.name}.`,
          reference_id: existingMember.id,
          project_id: projectId,
          is_read: false
        }, conn);

        return updated;
      });
    }
  }

  return withTransaction(async (conn) => {
    const newMember = await memberModel.create({
      project_id: projectId,
      user_id: targetUserId,
      role: 'collaborator',
      status: 'pending',
      invited_by: inviterId
    }, conn);

    await notificationModel.create({
      user_id: targetUserId,
      type: 'invitation',
      message: `You have been invited to collaborate on ${project.name}.`,
      reference_id: newMember.id,
      project_id: projectId,
      is_read: false
    }, conn);

    return newMember;
  });
};

exports.removeMember = async (projectId, memberIdOrUserId) => {
  return memberModel.remove(projectId, memberIdOrUserId);
};
