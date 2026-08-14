-- Private CCCD + OCR verification for partner applications.
-- Keep document_url for legacy rows, but new submissions no longer use public links.
ALTER TABLE partner_requests
    ALTER COLUMN document_url DROP NOT NULL;

ALTER TABLE partner_requests
    ADD COLUMN IF NOT EXISTS representative_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS cccd_front_path VARCHAR(500),
    ADD COLUMN IF NOT EXISTS cccd_back_path VARCHAR(500),
    ADD COLUMN IF NOT EXISTS ocr_identity_number VARCHAR(12),
    ADD COLUMN IF NOT EXISTS ocr_full_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS ocr_date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS ocr_identity_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_name_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_date_of_birth_matched BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMPTZ;

-- Legacy individual records at least keep the old legal name as representative name.
UPDATE partner_requests
SET representative_name = legal_name
WHERE representative_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_requests_identity_number
    ON partner_requests(identity_number);

CREATE INDEX IF NOT EXISTS idx_partner_requests_ocr_verified
    ON partner_requests(ocr_verified);
