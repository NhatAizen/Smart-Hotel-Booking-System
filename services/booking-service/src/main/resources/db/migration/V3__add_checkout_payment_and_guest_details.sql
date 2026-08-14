ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS booking_group_id UUID,
    ADD COLUMN IF NOT EXISTS booking_code VARCHAR(40),
    ADD COLUMN IF NOT EXISTS check_in_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS room_type_id UUID,
    ADD COLUMN IF NOT EXISTS adults INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS children INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_option VARCHAR(30) NOT NULL DEFAULT 'PAY_AT_HOTEL',
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN IF NOT EXISTS deposit_percent INTEGER,
    ADD COLUMN IF NOT EXISTS booker_first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS booker_last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS booker_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS booker_phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS booker_is_guest BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS guest_first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS guest_last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS invoice_requested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS invoice_company_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS invoice_tax_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS invoice_address VARCHAR(500),
    ADD COLUMN IF NOT EXISTS invoice_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMP WITH TIME ZONE;

UPDATE bookings
SET booking_group_id = COALESCE(booking_group_id, id),
    booking_code = COALESCE(
        booking_code,
        'EZR-OLD-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
    ),
    check_in_code = COALESCE(check_in_code, 'ENZIU-CHECKIN:' || id::text),
    adults = GREATEST(1, COALESCE(adults, guest_count, 1)),
    children = COALESCE(children, 0),
    remaining_amount = CASE
        WHEN remaining_amount = 0 THEN total_price
        ELSE remaining_amount
    END;

ALTER TABLE bookings
    ALTER COLUMN booking_code SET NOT NULL,
    ALTER COLUMN check_in_code SET NOT NULL;

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_status;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_status
        CHECK (
            status IN (
                'PENDING',
                'PENDING_PAYMENT',
                'CONFIRMED',
                'CHECKED_IN',
                'CHECKED_OUT',
                'CANCELLED'
            )
        );

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_payment_option;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_payment_option
        CHECK (payment_option IN ('PAY_AT_HOTEL', 'DEPOSIT', 'FULL_PAYMENT'));

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_payment_status;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_payment_status
        CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED'));

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_paid_amount;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_paid_amount
        CHECK (paid_amount >= 0 AND paid_amount <= total_price);

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_remaining_amount;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_remaining_amount
        CHECK (remaining_amount >= 0 AND remaining_amount <= total_price);

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_guest_numbers;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_guest_numbers
        CHECK (adults >= 1 AND children >= 0);

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_deposit_percent;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_deposit_percent
        CHECK (deposit_percent IS NULL OR deposit_percent BETWEEN 1 AND 99);

CREATE UNIQUE INDEX IF NOT EXISTS uk_bookings_booking_code
    ON bookings (booking_code);

CREATE UNIQUE INDEX IF NOT EXISTS uk_bookings_check_in_code
    ON bookings (check_in_code);

CREATE INDEX IF NOT EXISTS idx_bookings_group_id
    ON bookings (booking_group_id);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
    ON bookings (payment_status);
