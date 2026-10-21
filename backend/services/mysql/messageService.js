const messageModel = require('../../models/messageModel');

exports.list = async (projectId) => {
  return messageModel.listByProject(projectId);
};

exports.create = async (projectId, senderId, content) => {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) {
    const err = new Error('Message content is required');
    err.statusCode = 400;
    throw err;
  }
  return messageModel.create(projectId, senderId, trimmed);
};
