const fileModel = require('../../models/fileModel');
const versionModel = require('../../models/versionModel');
const projectModel = require('../../models/projectModel');

exports.listByProject = async (projectId) => {
  return fileModel.listByProject(projectId);
};

exports.getById = async (fileId, role) => {
  const file = await fileModel.findById(fileId);
  if (!file) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }
  const versions = await versionModel.listByFile(fileId);
  const project = await projectModel.findById(file.project_id);
  return {
    ...file,
    versions,
    userRole: role,
    creatorName: file.creatorName || file.creator_name || 'Unknown',
    projectName: project ? project.name : 'Unknown'
  };
};

exports.create = async (projectId, data, userId) => {
  const fileName = typeof data.file_name === 'string' ? data.file_name.trim() : '';
  if (!fileName) {
    const err = new Error('File name is required');
    err.statusCode = 400;
    throw err;
  }

  let current_code = data.current_code || '';
  if (!current_code && data.language) {
    if (data.language === 'Java') {
      current_code = `public class ${fileName.replace('.java', '')} {\n    public static void main(String[] args) {\n        \n    }\n}`;
    } else if (data.language === 'Python') {
      current_code = `def main():\n    pass\n\nif __name__ == "__main__":\n    main()`;
    } else if (data.language === 'C') {
      current_code = `#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}`;
    }
  }

  return fileModel.createWithTransaction(
    projectId,
    fileName,
    data.language || 'Java',
    current_code,
    userId
  );
};

exports.updateCode = async (fileId, code) => {
  const existing = await fileModel.findById(fileId);
  if (!existing) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }
  return fileModel.updateDraftCode(fileId, code);
};

exports.remove = async (fileId, userId) => {
  const existing = await fileModel.findById(fileId);
  if (!existing) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }
  return fileModel.deleteWithTransaction(fileId, userId);
};

exports.listVersions = async (fileId) => {
  return versionModel.listByFile(fileId);
};

exports.createVersion = async (fileId, data, userId) => {
  const file = await fileModel.findById(fileId);
  if (!file) {
    const err = new Error('File not found');
    err.statusCode = 404;
    throw err;
  }

  const code = (typeof data.code === 'string') ? data.code : (file.current_code || '');
  const note = data.note || data.commit_message || '';

  return versionModel.createWithTransaction(fileId, code, note, userId);
};
