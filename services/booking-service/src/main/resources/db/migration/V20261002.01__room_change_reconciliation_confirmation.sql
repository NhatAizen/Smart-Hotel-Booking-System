ALTER TABLE bookings ADD COLUMN room_change_reconciliation_state VARCHAR(30) NOT NULL DEFAULT 'NONE';
ALTER TABLE bookings ADD CONSTRAINT ck_booking_room_change_reconciliation_state
    CHECK (room_change_reconciliation_state IN ('NONE', 'PENDING', 'CONFIRMED', 'RECONCILIATION_REQUIRED'));
ALTER TABLE room_change_financial_outbox ADD COLUMN result_payload TEXT;
ALTER TABLE room_change_financial_outbox ADD COLUMN result_received_at TIMESTAMPTZ;
