ALTER TABLE users
    ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(30),
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS login_lock_level INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS login_lock_until TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP WITH TIME ZONE;

UPDATE users
SET username = 'user_' || SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12)
WHERE username IS NULL OR BTRIM(username) = '';

ALTER TABLE users
    ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_lower
    ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS ix_users_login_lock_until
    ON users (login_lock_until)
    WHERE login_lock_until IS NOT NULL;
