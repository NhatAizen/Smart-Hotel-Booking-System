-- Additive financial audit and idempotency foundation for customer wallet flows.
-- Historical rows intentionally remain nullable: their exact before/after balances
-- and actors cannot be reconstructed safely.

ALTER TABLE wallet_transactions
    ADD COLUMN balance_before NUMERIC(16, 2),
    ADD COLUMN balance_after NUMERIC(16, 2),
    ADD COLUMN reference_type VARCHAR(60),
    ADD COLUMN reference_id VARCHAR(160),
    ADD COLUMN idempotency_key VARCHAR(200),
    ADD COLUMN actor_type VARCHAR(40),
    ADD COLUMN actor_id UUID;

ALTER TABLE withdrawal_requests
    ADD COLUMN idempotency_key VARCHAR(200),
    ADD COLUMN completion_idempotency_key VARCHAR(200);

CREATE UNIQUE INDEX uq_wallet_transactions_idempotency_key
    ON wallet_transactions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_wallet_transactions_reference
    ON wallet_transactions (reference_type, reference_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX idx_wallet_transactions_wallet_created_id
    ON wallet_transactions (wallet_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX uq_withdrawal_owner_idempotency
    ON withdrawal_requests (owner_type, hotel_owner_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_withdrawal_completion_idempotency
    ON withdrawal_requests (completion_idempotency_key)
    WHERE completion_idempotency_key IS NOT NULL;

CREATE INDEX idx_withdrawals_owner_status_created
    ON withdrawal_requests (owner_type, hotel_owner_id, status, requested_at DESC, id DESC);

CREATE INDEX idx_withdrawals_status_created
    ON withdrawal_requests (status, requested_at DESC, id DESC);

-- A durable, per-booking mutex prevents distinct room-change events from
-- consuming the same settled-payment exposure concurrently across replicas.
CREATE TABLE booking_financial_locks (
    booking_id UUID PRIMARY KEY,
    last_room_change_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_booking_financial_lock_version CHECK (last_room_change_version >= 0)
);

CREATE TABLE financial_event_inbox (
    id UUID PRIMARY KEY,
    operation_type VARCHAR(60) NOT NULL,
    operation_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    room_change_version BIGINT NOT NULL,
    customer_id UUID NOT NULL,
    new_booking_total NUMERIC(16, 2) NOT NULL,
    expected_net_retained_amount NUMERIC(16, 2) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(160),
    valid_paid_amount NUMERIC(16, 2),
    credited_amount NUMERIC(16, 2),
    processed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_financial_event_operation_type CHECK (
        operation_type IN ('ROOM_CHANGE_CREDIT')
    ),
    CONSTRAINT ck_financial_event_room_change_version CHECK (room_change_version > 0),
    CONSTRAINT ck_financial_event_total CHECK (
        new_booking_total >= 0 AND new_booking_total = ROUND(new_booking_total)
    ),
    CONSTRAINT ck_financial_event_expected_retained CHECK (
        expected_net_retained_amount >= 0
        AND expected_net_retained_amount = ROUND(expected_net_retained_amount)
    ),
    CONSTRAINT ck_financial_event_results CHECK (
        (valid_paid_amount IS NULL AND credited_amount IS NULL)
        OR (
            valid_paid_amount IS NOT NULL
            AND credited_amount IS NOT NULL
            AND valid_paid_amount >= 0
            AND credited_amount >= 0
        )
    ),
    CONSTRAINT uq_financial_event_operation UNIQUE (operation_type, operation_id),
    CONSTRAINT uq_financial_event_booking_version UNIQUE (
        operation_type, booking_id, room_change_version
    )
);

CREATE INDEX idx_financial_event_booking
    ON financial_event_inbox (booking_id, processed_at DESC);
