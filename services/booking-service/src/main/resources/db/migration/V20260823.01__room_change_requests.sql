CREATE TABLE IF NOT EXISTS room_change_requests (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    hotel_id UUID NOT NULL,
    original_room_id UUID NOT NULL,
    original_room_type_id UUID,
    target_room_id UUID,
    target_room_type_id UUID,
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(30) NOT NULL,
    review_note VARCHAR(1000),
    old_total_price NUMERIC(14,2),
    new_total_price NUMERIC(14,2),
    price_difference NUMERIC(14,2),
    additional_payment_due NUMERIC(14,2),
    requested_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_room_change_customer_requested
    ON room_change_requests(customer_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_change_hotel_requested
    ON room_change_requests(hotel_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_change_booking
    ON room_change_requests(booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_change_pending_booking
    ON room_change_requests(booking_id)
    WHERE status = 'PENDING';
