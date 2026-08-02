CREATE TABLE account_action_tokens
(
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    token_type VARCHAR(40) NOT NULL,

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    used_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_account_action_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE,

    CONSTRAINT ck_account_action_token_type
        CHECK (
            token_type IN (
                'EMAIL_VERIFICATION',
                'PASSWORD_RESET'
            )
        )
);

CREATE INDEX idx_account_action_tokens_user_id
    ON account_action_tokens (user_id);

CREATE INDEX idx_account_action_tokens_hash
    ON account_action_tokens (token_hash);

CREATE INDEX idx_account_action_tokens_lookup
    ON account_action_tokens (
        user_id,
        token_type,
        used_at
    );

CREATE INDEX idx_account_action_tokens_expires_at
    ON account_action_tokens (expires_at);