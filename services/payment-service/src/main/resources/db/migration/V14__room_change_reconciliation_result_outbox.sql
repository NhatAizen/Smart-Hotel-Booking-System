CREATE TABLE room_change_result_outbox (
    event_id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    room_change_version BIGINT NOT NULL CHECK (room_change_version > 0),
    command_payload TEXT NOT NULL,
    result_payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED')),
    publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error VARCHAR(1000),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_room_change_result_booking_version UNIQUE (booking_id, room_change_version)
);
CREATE INDEX ix_room_change_result_pending ON room_change_result_outbox(next_attempt_at, created_at) WHERE status = 'PENDING';
