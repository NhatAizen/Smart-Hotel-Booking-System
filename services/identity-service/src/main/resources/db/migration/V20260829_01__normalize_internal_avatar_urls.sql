-- Internal profile images must be origin-independent. This repairs legacy rows
-- created with localhost, container-host, HTTP, or an old public domain while
-- leaving external OAuth provider images untouched.
UPDATE users
SET avatar_url = '/api/users/media/'
    || regexp_replace(avatar_url, '^.*/api/users/media/', '')
WHERE avatar_url LIKE '%/api/users/media/%';
