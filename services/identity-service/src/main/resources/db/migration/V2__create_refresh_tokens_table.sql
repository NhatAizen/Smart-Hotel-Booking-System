CREATE TABLE refresh_tokens
(
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    revoked_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id
    ON refresh_tokens (user_id);

CREATE INDEX idx_refresh_tokens_expires_at
    ON refresh_tokens (expires_at);

CREATE INDEX idx_refresh_tokens_active
    ON refresh_tokens (user_id, revoked_at);