const store = require('../data/store');

exports.list = (projectId) => {
    const messages = store.filter('messages', m => m.project_id === projectId);
    return messages.map(m => {
        const sender = store.findById('users', m.sender_id);
        return {
            ...m,
            senderName: sender ? sender.full_name : 'Unknown'
        };
    });
};

exports.create = (projectId, senderId, content) => {
    if (!content || !content.trim()) {
        const err = new Error('Message content is required');
        err.statusCode = 400;
        throw err;
    }
    
    const message = store.insert('messages', {
        id: 'msg' + Date.now(),
        project_id: projectId,
        sender_id: senderId,
        content: content.trim(),
        created_at: new Date().toISOString()
    });
    
    const sender = store.findById('users', senderId);
    
    return {
        ...message,
        senderName: sender ? sender.full_name : 'Unknown'
    };
};
