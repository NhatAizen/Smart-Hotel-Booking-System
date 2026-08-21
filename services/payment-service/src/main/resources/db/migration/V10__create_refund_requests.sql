CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    booking_code VARCHAR(40) NOT NULL,
    customer_id UUID NOT NULL,
    hotel_id UUID NOT NULL,
    hotel_owner_id UUID NOT NULL,
    booking_status_snapshot VARCHAR(30) NOT NULL,
    payment_option_snapshot VARCHAR(30),
    reason_code VARCHAR(60) NOT NULL,
    customer_note VARCHAR(1000),
    policy_code VARCHAR(60) NOT NULL,
    policy_message VARCHAR(1000) NOT NULL,
    total_paid_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    platform_held_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    hotel_direct_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    manual_reconciliation_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    refund_bank_name VARCHAR(120),
    refund_account_number VARCHAR(60),
    refund_account_name VARCHAR(180),
    status VARCHAR(40) NOT NULL,
    reviewed_by UUID,
    review_note VARCHAR(1000),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    platform_refunded_at TIMESTAMP WITH TIME ZONE,
    hotel_refunded_at TIMESTAMP WITH TIME ZONE,
    hotel_refund_reference VARCHAR(180),
    hotel_refund_proof_data BYTEA,
    hotel_refund_proof_content_type VARCHAR(100),
    hotel_refund_proof_file_name VARCHAR(255),
    manual_resolved_at TIMESTAMP WITH TIME ZONE,
    manual_resolved_by UUID,
    manual_resolution_note VARCHAR(1000),
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_refund_request_status CHECK (
        status IN ('PENDING_HOTEL_REVIEW','APPROVED','PARTIALLY_COMPLETED','COMPLETED','REJECTED')
    ),
    CONSTRAINT ck_refund_amounts_non_negative CHECK (
        total_paid_amount >= 0 AND platform_held_amount >= 0
        AND hotel_direct_amount >= 0 AND manual_reconciliation_amount >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_customer
    ON refund_requests(customer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_hotel_owner
    ON refund_requests(hotel_owner_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status
    ON refund_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_booking
    ON refund_requests(booking_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_active_booking
    ON refund_requests(booking_id)
    WHERE status IN ('PENDING_HOTEL_REVIEW','APPROVED','PARTIALLY_COMPLETED');
