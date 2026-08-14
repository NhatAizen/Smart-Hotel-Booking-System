ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS base_accommodation_amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS weekend_surcharge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS special_date_surcharge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS late_checkout_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS late_fee_assessed_at TIMESTAMPTZ;

UPDATE bookings
SET base_accommodation_amount = COALESCE(base_accommodation_amount, total_price - late_checkout_fee)
WHERE base_accommodation_amount IS NULL;

ALTER TABLE bookings
    ALTER COLUMN base_accommodation_amount SET NOT NULL;

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_dynamic_price_parts;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_dynamic_price_parts
        CHECK (
            base_accommodation_amount >= 0
            AND weekend_surcharge_amount >= 0
            AND special_date_surcharge_amount >= 0
            AND late_checkout_fee >= 0
        );

CREATE TABLE IF NOT EXISTS special_pricing_dates (
    id UUID PRIMARY KEY,
    pricing_date DATE NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    surcharge_percent NUMERIC(5, 2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_special_pricing_dates_percent
        CHECK (surcharge_percent >= 0 AND surcharge_percent <= 500)
);

CREATE INDEX IF NOT EXISTS idx_special_pricing_dates_active_date
    ON special_pricing_dates (active, pricing_date);

CREATE TABLE IF NOT EXISTS booking_night_prices (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    stay_date DATE NOT NULL,
    base_price NUMERIC(14, 2) NOT NULL,
    pricing_type VARCHAR(30) NOT NULL,
    pricing_label VARCHAR(180) NOT NULL,
    surcharge_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    surcharge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    final_price NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_night_prices_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT uq_booking_night_prices_booking_date UNIQUE (booking_id, stay_date),
    CONSTRAINT ck_booking_night_prices_values CHECK (
        base_price >= 0
        AND surcharge_percent >= 0
        AND surcharge_amount >= 0
        AND final_price >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_booking_night_prices_booking
    ON booking_night_prices (booking_id, stay_date);

-- Các ngày đặc biệt cố định để hệ thống dùng ngay trong năm demo 2026.
-- Có thể INSERT/UPDATE thêm ngày Tết, sự kiện hoặc cao điểm mà không cần sửa code.
INSERT INTO special_pricing_dates (
    id, pricing_date, name, surcharge_percent, active
) VALUES
    ('8f47fb73-faa0-4c9c-9614-000000000101', DATE '2026-01-01', 'Tết Dương lịch', 20, TRUE),
    ('8f47fb73-faa0-4c9c-9614-000000000430', DATE '2026-04-30', 'Ngày 30/04', 20, TRUE),
    ('8f47fb73-faa0-4c9c-9614-000000000501', DATE '2026-05-01', 'Ngày 01/05', 20, TRUE),
    ('8f47fb73-faa0-4c9c-9614-000000000902', DATE '2026-09-02', 'Quốc khánh 02/09', 20, TRUE)
ON CONFLICT (pricing_date) DO NOTHING;
