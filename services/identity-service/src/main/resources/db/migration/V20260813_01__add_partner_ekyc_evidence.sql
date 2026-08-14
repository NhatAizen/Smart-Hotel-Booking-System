ALTER TABLE partner_ekyc_verification_sessions
    ADD COLUMN IF NOT EXISTS evidence_path VARCHAR(500);

ALTER TABLE partner_requests
    ADD COLUMN IF NOT EXISTS ekyc_evidence_path VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_partner_requests_ekyc_evidence
    ON partner_requests (ekyc_verified, created_at DESC);
