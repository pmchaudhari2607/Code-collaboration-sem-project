-- Migration: 002_languages_cpp_javascript
-- Adds C++ and JavaScript to languages lookup table

INSERT INTO languages (name, file_extensions, codemirror_mode, is_file_language, is_enabled) VALUES
  ('C++', '.cpp,.h,.hpp,.cc,.cxx', 'text/x-c++src', 1, 1),
  ('JavaScript', '.js,.mjs,.cjs', 'javascript', 1, 1)
ON DUPLICATE KEY UPDATE
  file_extensions = VALUES(file_extensions),
  codemirror_mode = VALUES(codemirror_mode),
  is_file_language = VALUES(is_file_language),
  is_enabled = VALUES(is_enabled);
