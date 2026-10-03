-- Additive only. Historical request amounts remain intact and are NOT assumed authoritative.
ALTER TABLE bookings ADD COLUMN row_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD CONSTRAINT ck_booking_row_version CHECK (row_version >= 0);

ALTER TABLE room_change_requests
    ADD COLUMN financial_reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE room_change_requests ADD CONSTRAINT ck_room_change_request_financial_status
    CHECK (financial_reconciliation_status IN
        ('LEGACY', 'NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'RECONCILIATION_REQUIRED'));
ALTER TABLE room_change_requests ADD CONSTRAINT ck_room_change_request_resolved_due
    CHECK ((financial_reconciliation_status NOT IN ('PENDING', 'RECONCILIATION_REQUIRED')
                OR additional_payment_due IS NULL)
        AND (financial_reconciliation_status <> 'CONFIRMED'
                OR (additional_payment_due IS NOT NULL AND additional_payment_due >= 0)));
