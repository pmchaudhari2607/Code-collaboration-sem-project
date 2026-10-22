const SUPPORTED_LANGUAGES = ['C', 'C++', 'Java', 'Python', 'JavaScript'];
const PROJECT_CATEGORIES = ['C', 'C++', 'Java', 'Python', 'JavaScript', 'Mixed'];

const LANGUAGE_EXTENSIONS = {
  'C': ['.c', '.h'],
  'C++': ['.cpp', '.hpp', '.h', '.cc', '.cxx'],
  'Java': ['.java'],
  'Python': ['.py'],
  'JavaScript': ['.js', '.mjs', '.cjs']
};

function detectLanguage(fileName, fallback = 'C') {
  if (!fileName || typeof fileName !== 'string') return fallback;
  const parts = fileName.split('.');
  if (parts.length < 2) return fallback;
  const ext = parts.pop().toLowerCase();
  if (['cpp', 'hpp', 'cc', 'cxx'].includes(ext)) return 'C++';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'JavaScript';
  if (ext === 'java') return 'Java';
  if (ext === 'py') return 'Python';
  if (ext === 'c') return 'C';
  if (ext === 'h') return fallback === 'C++' ? 'C++' : 'C';
  return fallback;
}

function getDefaultCode(language, fileName = '') {
  if (!language) return '';
  if (language === 'Java') {
    const cls = (fileName || 'Main').replace(/\.java$/i, '');
    return `public class ${cls} {\n    public static void main(String[] args) {\n        \n    }\n}\n`;
  }
  if (language === 'Python') {
    return `def main():\n    pass\n\nif __name__ == "__main__":\n    main()\n`;
  }
  if (language === 'C') {
    if (fileName && fileName.endsWith('.h')) {
      const guard = fileName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      return `#ifndef ${guard}\n#define ${guard}\n\n// C declarations\n\n#endif\n`;
    }
    return `#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n`;
  }
  if (language === 'C++') {
    if (fileName && (fileName.endsWith('.hpp') || fileName.endsWith('.h'))) {
      const guard = fileName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      return `#ifndef ${guard}\n#define ${guard}\n\n// C++ declarations\n\n#endif\n`;
    }
    return `#include <iostream>\n\nint main() {\n    std::cout << "Hello World" << std::endl;\n    return 0;\n}\n`;
  }
  if (language === 'JavaScript') {
    return `function main() {\n    console.log("Hello World");\n}\n\nmain();\n`;
  }
  return '';
}

module.exports = {
  SUPPORTED_LANGUAGES,
  PROJECT_CATEGORIES,
  LANGUAGE_EXTENSIONS,
  detectLanguage,
  getDefaultCode
};
