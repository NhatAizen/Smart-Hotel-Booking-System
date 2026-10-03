ALTER TABLE bookings
    ADD COLUMN room_change_financial_version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_bookings_room_change_financial_version
        CHECK (room_change_financial_version >= 0);

CREATE TABLE room_change_financial_outbox (
    event_id UUID PRIMARY KEY,
    room_change_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    new_booking_total NUMERIC(16, 2) NOT NULL,
    expected_net_retained_amount NUMERIC(16, 2) NOT NULL,
    room_change_version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(160),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ,
    last_error VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_room_change_financial_outbox_change UNIQUE (room_change_id),
    CONSTRAINT uq_room_change_financial_outbox_booking_version
        UNIQUE (booking_id, room_change_version),
    CONSTRAINT ck_room_change_financial_outbox_status CHECK (
        status IN ('PENDING', 'PUBLISHED')
    ),
    CONSTRAINT ck_room_change_financial_outbox_total CHECK (
        new_booking_total >= 0 AND new_booking_total = ROUND(new_booking_total)
    ),
    CONSTRAINT ck_room_change_financial_outbox_expected_retained CHECK (
        expected_net_retained_amount >= 0
        AND expected_net_retained_amount = ROUND(expected_net_retained_amount)
    ),
    CONSTRAINT ck_room_change_financial_outbox_version CHECK (
        room_change_version > 0
    ),
    CONSTRAINT ck_room_change_financial_outbox_attempts CHECK (publish_attempts >= 0)
);

CREATE INDEX idx_room_change_financial_outbox_pending
    ON room_change_financial_outbox (status, next_attempt_at, created_at)
    WHERE status = 'PENDING';
