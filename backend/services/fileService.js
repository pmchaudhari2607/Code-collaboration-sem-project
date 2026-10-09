const store = require('../data/store');

exports.listByProject = (projectId) => {
  const files = store.filter('code_files', f => f.project_id === projectId);
  return files.map(f => {
    const versions = store.filter('code_versions', v => v.file_id === f.id);
    const latestVer = versions.length > 0 ? Math.max(...versions.map(v=>v.version_number)) : 0;
    const openReviews = store.filter('reviews', r => r.file_id === f.id && r.status === 'open').length;
    const creator = store.findById('users', f.created_by)?.full_name || 'Unknown';
    return { ...f, currentVersionNumber: latestVer, openReviewsCount: openReviews, creatorName: creator };
  });
};

exports.create = (projectId, data, userId) => {
  if (store.find('code_files', f => f.project_id === projectId && f.file_name === data.file_name)) {
     const err = new Error('File name already exists in this project'); err.statusCode = 409; throw err;
  }
  let current_code = data.current_code || '';
  if (!current_code && data.language) {
      if (data.language === 'Java') current_code = `public class ${data.file_name.replace('.java','')} {\n    public static void main(String[] args) {\n        \n    }\n}`;
      else if (data.language === 'Python') current_code = `def main():\n    pass\n\nif __name__ == "__main__":\n    main()`;
      else if (data.language === 'C') current_code = `#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}`;
  }

  const newFile = store.insert('code_files', {
    id: 'f' + Date.now(),
    project_id: projectId,
    file_name: data.file_name,
    language: data.language,
    current_code: current_code,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  store.insert('activity', { id: 'a' + Date.now(), project_id: projectId, user_id: userId, action_text: `created file ${data.file_name}.`, created_at: new Date().toISOString() });
  
  const initialVersion = store.insert('code_versions', {
    id: 'v' + Date.now(),
    file_id: newFile.id,
    version_number: 1,
    code: newFile.current_code,
    created_by: userId,
    created_at: new Date().toISOString()
  });
  
  return { ...newFile, versions: [initialVersion] };
};

exports.getById = (fileId, role) => {
  const file = store.findById('code_files', fileId);
  const versions = store.filter('code_versions', v => v.file_id === fileId).sort((a,b) => b.version_number - a.version_number);
  const creator = store.findById('users', file.created_by)?.full_name || 'Unknown';
  const project = store.findById('projects', file.project_id);
  return { ...file, versions, userRole: role, creatorName: creator, projectName: project.name };
};

exports.updateCode = (fileId, code) => {
  return store.update('code_files', fileId, { current_code: code, updated_at: new Date().toISOString() });
};

exports.remove = (fileId) => {
  return store.remove('code_files', fileId);
};

exports.listVersions = (fileId) => {
  return store.filter('code_versions', v => v.file_id === fileId).sort((a,b) => b.version_number - a.version_number)
    .map(v => ({ ...v, creatorName: store.findById('users', v.created_by)?.full_name || 'Unknown' }));
};

exports.createVersion = (fileId, data, userId) => {
  const file = store.findById('code_files', fileId);
  store.update('code_files', fileId, { current_code: data.code, updated_at: new Date().toISOString() });
  
  const existingVersions = store.filter('code_versions', v => v.file_id === fileId);
  const nextVerNum = existingVersions.length > 0 ? Math.max(...existingVersions.map(v=>v.version_number)) + 1 : 1;
  
  const newVersion = store.insert('code_versions', {
    id: 'v' + Date.now(),
    file_id: fileId,
    version_number: nextVerNum,
    code: data.code,
    note: data.note || data.commit_message || '',
    created_by: userId,
    created_at: new Date().toISOString()
  });
  
  store.insert('activity', { id: 'a' + Date.now(), project_id: file.project_id, user_id: userId, action_text: `created Version ${nextVerNum} of ${file.file_name}.`, created_at: new Date().toISOString() });
  
  const actor = store.findById('users', userId);
  const project = store.findById('projects', file.project_id);
  const members = store.filter('project_members', m => m.project_id === file.project_id && m.status === 'accepted').map(m => m.user_id);
  const targets = new Set([project.owner_id, ...members]);
  targets.delete(userId);
  targets.forEach(uid => {
      store.insert('notifications', {
          id: 'n' + Date.now() + Math.random(),
          user_id: uid,
          type: 'version',
          message: `${actor.full_name} created Version ${nextVerNum} of ${file.file_name}`,
          reference_id: newVersion.id,
          project_id: file.project_id,
          is_read: false,
          created_at: new Date().toISOString()
      });
  });
  
  return newVersion;
};
