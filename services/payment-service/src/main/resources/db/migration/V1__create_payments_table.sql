CREATE TABLE payments
(
    id UUID PRIMARY KEY,

    booking_id UUID NOT NULL,

    customer_id UUID NOT NULL,

    amount NUMERIC(14, 2) NOT NULL,

    method VARCHAR(30) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    transaction_code VARCHAR(120),

    failure_reason VARCHAR(500),

    paid_at TIMESTAMP WITH TIME ZONE,

    refunded_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_payments_amount
        CHECK (amount > 0),

    CONSTRAINT ck_payments_method
        CHECK (
            method IN (
                'CASH',
                'BANK_TRANSFER',
                'MOMO',
                'VNPAY',
                'CREDIT_CARD'
            )
        ),

    CONSTRAINT ck_payments_status
        CHECK (
            status IN (
                'PENDING',
                'PAID',
                'FAILED',
                'REFUNDED'
            )
        )
);

CREATE INDEX idx_payments_booking_id
    ON payments (booking_id);

CREATE INDEX idx_payments_customer_id
    ON payments (customer_id);

CREATE INDEX idx_payments_status
    ON payments (status);

CREATE UNIQUE INDEX uq_payments_transaction_code
    ON payments (transaction_code)
    WHERE transaction_code IS NOT NULL;