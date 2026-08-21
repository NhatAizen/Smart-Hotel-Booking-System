ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS identity_verification_method VARCHAR(20);

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS bookings_identity_verification_method_check;

ALTER TABLE bookings
    ADD CONSTRAINT bookings_identity_verification_method_check
        CHECK (identity_verification_method IS NULL
            OR identity_verification_method IN ('QR_CCCD', 'MANUAL'));
