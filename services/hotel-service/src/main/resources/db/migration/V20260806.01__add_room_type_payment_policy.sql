ALTER TABLE room_types
    ADD COLUMN IF NOT EXISTS pay_at_hotel_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deposit_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deposit_percent INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS full_payment_allowed BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE room_types
    DROP CONSTRAINT IF EXISTS ck_room_types_deposit_percent;

ALTER TABLE room_types
    ADD CONSTRAINT ck_room_types_deposit_percent
        CHECK (deposit_percent BETWEEN 1 AND 99);

ALTER TABLE room_types
    DROP CONSTRAINT IF EXISTS ck_room_types_payment_policy;

ALTER TABLE room_types
    ADD CONSTRAINT ck_room_types_payment_policy
        CHECK (
            pay_at_hotel_allowed
            OR deposit_allowed
            OR full_payment_allowed
        );
