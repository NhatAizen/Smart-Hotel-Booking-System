-- Final partner onboarding hardening:
-- 1) cross-check the MRZ printed on the back of the identity card,
-- 2) collect business-only legal evidence,
-- 3) lock the approved hotel-admin payout destination to the reviewed partner profile.
ALTER TABLE partner_requests
    ADD COLUMN IF NOT EXISTS mrz_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mrz_format_valid BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mrz_identity_number VARCHAR(12),
    ADD COLUMN IF NOT EXISTS mrz_full_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS mrz_date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS mrz_identity_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mrz_name_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mrz_date_of_birth_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mrz_processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS business_tax_code VARCHAR(13),
    ADD COLUMN IF NOT EXISTS business_license_path VARCHAR(500),
    ADD COLUMN IF NOT EXISTS payout_bank_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS payout_bank_bin VARCHAR(6),
    ADD COLUMN IF NOT EXISTS payout_account_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS payout_account_name VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_requests_business_tax_code
    ON partner_requests (business_tax_code)
    WHERE business_tax_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_requests_mrz_verified
    ON partner_requests (mrz_verified);
