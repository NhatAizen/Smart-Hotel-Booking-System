-- Extend the existing partner application with contact details and private
-- supporting documents. Files remain on the configured private media store;
-- only metadata and relative storage paths are persisted here.
ALTER TABLE partner_requests
    ADD COLUMN IF NOT EXISTS contact_email VARCHAR(254),
    ADD COLUMN IF NOT EXISTS management_proof_path VARCHAR(500),
    ADD COLUMN IF NOT EXISTS management_proof_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS management_proof_content_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS management_proof_size BIGINT,
    ADD COLUMN IF NOT EXISTS business_license_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS business_license_content_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS business_license_size BIGINT;

ALTER TABLE partner_requests
    DROP CONSTRAINT IF EXISTS ck_partner_requests_status;

ALTER TABLE partner_requests
    ADD CONSTRAINT ck_partner_requests_status
        CHECK (status IN ('PENDING', 'NEED_MORE_INFO', 'APPROVED', 'REJECTED'));

DROP INDEX IF EXISTS ux_partner_requests_pending_user;

CREATE UNIQUE INDEX ux_partner_requests_active_user
    ON partner_requests(user_id)
    WHERE status IN ('PENDING', 'NEED_MORE_INFO');

CREATE INDEX IF NOT EXISTS idx_partner_requests_business_tax_code
    ON partner_requests(business_tax_code)
    WHERE business_tax_code IS NOT NULL;
