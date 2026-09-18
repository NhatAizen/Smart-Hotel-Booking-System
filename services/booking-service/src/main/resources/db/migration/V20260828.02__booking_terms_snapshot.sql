ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS hotel_policy_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS minimum_age_snapshot INTEGER,
    ADD COLUMN IF NOT EXISTS room_refundable_snapshot BOOLEAN;

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_minimum_age_snapshot;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_minimum_age_snapshot
        CHECK (minimum_age_snapshot IS NULL OR minimum_age_snapshot BETWEEN 16 AND 25);
