const messageService = require('../services/messageService');
const { success } = require('../utils/response');

exports.list = async (req, res, next) => {
  try { 
    const data = await messageService.list(req.params.projectId);
    success(res, 'Messages', data); 
  } catch(e) { 
    next(e); 
  }
};

exports.create = async (req, res, next) => {
  try { 
    const data = await messageService.create(req.params.projectId, req.user.id, req.body.content);
    success(res, 'Message sent', data, 201); 
  } catch(e) { 
    next(e); 
  }
};
