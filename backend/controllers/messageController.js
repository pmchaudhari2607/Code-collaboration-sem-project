const messageService = require('../services/messageService');
const { success } = require('../utils/response');

exports.list = (req, res, next) => {
    try { 
        success(res, 'Messages', messageService.list(req.params.projectId)); 
    } catch(e) { 
        next(e); 
    }
};

exports.create = (req, res, next) => {
    try { 
        success(res, 'Message sent', messageService.create(req.params.projectId, req.user.id, req.body.content), 201); 
    } catch(e) { 
        next(e); 
    }
};
