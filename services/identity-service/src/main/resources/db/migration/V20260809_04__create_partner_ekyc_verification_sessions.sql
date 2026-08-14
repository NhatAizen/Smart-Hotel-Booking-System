CREATE TABLE IF NOT EXISTS partner_ekyc_verification_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receipt_token_hash VARCHAR(64) NOT NULL UNIQUE,
    cccd_front_sha256 VARCHAR(64) NOT NULL,
    challenge_id VARCHAR(64) NOT NULL,
    liveness_verified BOOLEAN NOT NULL,
    face_verified BOOLEAN NOT NULL,
    face_similarity NUMERIC(7,5),
    face_match_threshold NUMERIC(7,5),
    processed_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_ekyc_sessions_user
    ON partner_ekyc_verification_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_ekyc_sessions_expiry
    ON partner_ekyc_verification_sessions (expires_at);
