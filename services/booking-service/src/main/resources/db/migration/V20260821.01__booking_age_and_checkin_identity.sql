ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS booker_date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS identity_name_matched BOOLEAN,
    ADD COLUMN IF NOT EXISTS identity_date_of_birth_matched BOOLEAN,
    ADD COLUMN IF NOT EXISTS identity_age_eligible BOOLEAN,
    ADD COLUMN IF NOT EXISTS identity_age_at_check_in INTEGER,
    ADD COLUMN IF NOT EXISTS identity_number_last4 VARCHAR(4),
    ADD COLUMN IF NOT EXISTS identity_verified_by UUID,
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS identity_verification_failure_reason VARCHAR(80);

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS bookings_identity_verification_status_check;

ALTER TABLE bookings
    ADD CONSTRAINT bookings_identity_verification_status_check
        CHECK (identity_verification_status IN ('PENDING', 'VERIFIED', 'FAILED'));
