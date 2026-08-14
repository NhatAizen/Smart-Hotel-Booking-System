ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS customer_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bookings_customer_visible_created
    ON bookings (customer_id, customer_hidden, created_at DESC);
