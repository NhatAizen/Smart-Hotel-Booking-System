CREATE TABLE platform_policy_settings (
    id SMALLINT PRIMARY KEY,
    minimum_booking_age INTEGER NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_platform_policy_singleton CHECK (id = 1),
    CONSTRAINT ck_platform_policy_minimum_age CHECK (minimum_booking_age BETWEEN 16 AND 25)
);

-- Reuse the existing booking/check-in rule that was previously hard-coded in service code.
INSERT INTO platform_policy_settings (id, minimum_booking_age, updated_by, updated_at)
VALUES (1, 18, NULL, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
