const taskModel = require('../../models/taskModel');
const projectModel = require('../../models/projectModel');
const memberModel = require('../../models/memberModel');
const reviewModel = require('../../models/reviewModel');
const userModel = require('../../models/userModel');
const notificationModel = require('../../models/notificationModel');
const activityModel = require('../../models/activityModel');
const { withTransaction } = require('../../db/transaction');

const normalizeDate = (val) => {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    const err = new Error('Invalid due_date format');
    err.statusCode = 400;
    throw err;
  }
  return d.toISOString().slice(0, 10);
};

const assertValidAssignee = async (projectId, userId, conn = null) => {
  if (!userId) return;
  const project = await projectModel.findById(projectId, null, conn);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 400;
    throw err;
  }
  const role = await memberModel.getRole(projectId, userId, conn);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('Assigned user must be project owner or accepted collaborator');
    err.statusCode = 400;
    throw err;
  }
};

exports.list = async (userId, projectId = null) => {
  return taskModel.list(userId, projectId);
};

exports.create = async (data, userId) => {
  if (!data.project_id) {
    const err = new Error('Project ID is required');
    err.statusCode = 400;
    throw err;
  }

  const role = await memberModel.getRole(data.project_id, userId);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('You do not have permission to create tasks on this project.');
    err.statusCode = 403;
    throw err;
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    const err = new Error('Task title cannot be empty');
    err.statusCode = 400;
    throw err;
  }

  const status = data.status || 'todo';
  if (!['todo', 'in_progress', 'completed'].includes(status)) {
    const err = new Error('Invalid task status');
    err.statusCode = 400;
    throw err;
  }

  const priority = data.priority || 'medium';
  if (!['low', 'medium', 'high'].includes(priority)) {
    const err = new Error('Invalid task priority');
    err.statusCode = 400;
    throw err;
  }

  let review_id = null;
  if (data.review_id) {
    const review = await reviewModel.findById(data.review_id);
    if (!review) {
      const err = new Error('Review not found');
      err.statusCode = 400;
      throw err;
    }
    const rProjectId = await reviewModel.getProjectId(data.review_id);
    if (rProjectId !== data.project_id) {
      const err = new Error('Review does not belong to this project');
      err.statusCode = 400;
      throw err;
    }
    review_id = data.review_id;
  }

  const assigned_to = data.assigned_to ? data.assigned_to : null;
  if (assigned_to) {
    await assertValidAssignee(data.project_id, assigned_to);
  }

  const due_date = normalizeDate(data.due_date);

  return withTransaction(async (conn) => {
    const newTask = await taskModel.create({
      project_id: data.project_id,
      review_id,
      title,
      description: typeof data.description === 'string' ? data.description.trim() : '',
      status,
      priority,
      assigned_to,
      due_date
    }, userId, conn);

    if (assigned_to && assigned_to !== userId) {
      const actor = await userModel.findById(userId, conn);
      const actorName = actor ? actor.full_name : 'Someone';
      await notificationModel.create({
        user_id: assigned_to,
        type: 'task',
        message: `${actorName} assigned you a task: ${title}`,
        reference_id: newTask.id,
        project_id: data.project_id,
        is_read: false
      }, conn);
    }

    return newTask;
  });
};

exports.update = async (taskId, data, userId) => {
  const existingTask = await taskModel.findById(taskId);
  if (!existingTask) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const role = await memberModel.getRole(existingTask.project_id, userId);
  const isAssignee = existingTask.assigned_to === userId;

  if (role !== 'owner' && role !== 'collaborator' && !isAssignee) {
    const err = new Error('You do not have permission to update this task.');
    err.statusCode = 403;
    throw err;
  }

  const patch = {};

  if (data.status !== undefined) {
    if (!['todo', 'in_progress', 'completed'].includes(data.status)) {
      const err = new Error('Invalid task status');
      err.statusCode = 400;
      throw err;
    }
    patch.status = data.status;
  }

  // Non-owner, non-collaborator assignee can ONLY update status
  if (isAssignee && role !== 'owner' && role !== 'collaborator') {
    if (data.title !== undefined || data.description !== undefined || data.priority !== undefined || data.assigned_to !== undefined || data.due_date !== undefined) {
      const err = new Error('You do not have permission to modify task details.');
      err.statusCode = 403;
      throw err;
    }
  } else {
    // Owner or collaborator can update other fields
    if (data.title !== undefined) {
      const trimmed = typeof data.title === 'string' ? data.title.trim() : '';
      if (!trimmed) {
        const err = new Error('Task title cannot be empty');
        err.statusCode = 400;
        throw err;
      }
      patch.title = trimmed;
    }

    if (data.description !== undefined) {
      patch.description = typeof data.description === 'string' ? data.description.trim() : '';
    }

    if (data.priority !== undefined) {
      if (!['low', 'medium', 'high'].includes(data.priority)) {
        const err = new Error('Invalid task priority');
        err.statusCode = 400;
        throw err;
      }
      patch.priority = data.priority;
    }

    if (data.assigned_to !== undefined) {
      if (data.assigned_to) {
        await assertValidAssignee(existingTask.project_id, data.assigned_to);
        patch.assigned_to = data.assigned_to;
      } else {
        patch.assigned_to = null;
      }
    }

    if (data.due_date !== undefined) {
      patch.due_date = normalizeDate(data.due_date);
    }
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (conn) => {
    const updated = await taskModel.update(taskId, patch, conn);

    await activityModel.create(
      existingTask.project_id,
      userId,
      `updated task: ${updated.title}.`,
      conn
    );

    // If reassigned to a new user, notify them
    if (patch.assigned_to && patch.assigned_to !== existingTask.assigned_to && patch.assigned_to !== userId) {
      const actor = await userModel.findById(userId, conn);
      const actorName = actor ? actor.full_name : 'Someone';
      await notificationModel.create({
        user_id: patch.assigned_to,
        type: 'task',
        message: `${actorName} assigned you a task: ${updated.title}`,
        reference_id: taskId,
        project_id: existingTask.project_id,
        is_read: false
      }, conn);
    }

    return updated;
  });
};
