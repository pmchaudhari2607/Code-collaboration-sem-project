-- Migration: 001_username_check
-- Pre-check requirement: abort if any existing username is longer than 15 characters
-- Updates chk_users_username check constraint from {3,30} to {3,15}

ALTER TABLE users DROP CHECK chk_users_username;
ALTER TABLE users ADD CONSTRAINT chk_users_username CHECK (username REGEXP '^[A-Za-z0-9_]{3,15}$');
