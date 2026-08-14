ALTER TABLE partner_requests
    ADD COLUMN IF NOT EXISTS liveness_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS face_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS face_similarity NUMERIC(7,5),
    ADD COLUMN IF NOT EXISTS ekyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ekyc_challenge_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS ekyc_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_partner_requests_ekyc_verified
    ON partner_requests (ekyc_verified);
