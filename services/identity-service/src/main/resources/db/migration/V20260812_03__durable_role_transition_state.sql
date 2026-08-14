ALTER TABLE users
    ADD COLUMN role_transition_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN role_transition_id UUID;

ALTER TABLE users
    ADD CONSTRAINT ck_user_role_transition_state
        CHECK (
            NOT role_transition_in_progress
            OR (role = 'HOTEL_ADMIN' AND role_transition_id IS NOT NULL)
        );

CREATE INDEX idx_users_role_transition_in_progress
    ON users(role_transition_id)
    WHERE role_transition_in_progress;
