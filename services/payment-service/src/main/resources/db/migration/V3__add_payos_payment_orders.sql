CREATE TABLE payment_orders
(
    id UUID PRIMARY KEY,
    order_code BIGINT NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    payment_type VARCHAR(30) NOT NULL,
    method VARCHAR(30) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    status VARCHAR(30) NOT NULL,
    description VARCHAR(50) NOT NULL,
    payment_link_id VARCHAR(120),
    checkout_url VARCHAR(1000),
    qr_code TEXT,
    provider_status VARCHAR(50),
    provider_reference VARCHAR(150),
    failure_reason VARCHAR(1000),
    wallet_applied BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_payment_orders_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_orders_type CHECK (
        payment_type IN ('DEPOSIT', 'FULL_PAYMENT', 'REMAINING_PAYMENT', 'WALLET_TOP_UP')
    ),
    CONSTRAINT ck_payment_orders_method CHECK (method = 'PAYOS'),
    CONSTRAINT ck_payment_orders_status CHECK (
        status IN ('PENDING', 'PROCESSING', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED')
    )
);

CREATE INDEX idx_payment_orders_customer ON payment_orders (customer_id, created_at DESC);
CREATE INDEX idx_payment_orders_status ON payment_orders (status);

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payment_order_id UUID,
    ADD COLUMN IF NOT EXISTS hotel_id UUID,
    ADD COLUMN IF NOT EXISTS hotel_owner_id UUID,
    ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hotel_net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS booking_applied BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS wallet_applied BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS revenue_released BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_payment_order;
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_payment_order
        FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_method CHECK (
        method IN ('CASH', 'BANK_TRANSFER', 'MOMO', 'VNPAY', 'PAYOS', 'CREDIT_CARD')
    );

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_status;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_status CHECK (
        status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED')
    );

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_commission_rate;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 100);

CREATE INDEX IF NOT EXISTS idx_payments_payment_order ON payments (payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_hotel_owner ON payments (hotel_owner_id, created_at DESC);
