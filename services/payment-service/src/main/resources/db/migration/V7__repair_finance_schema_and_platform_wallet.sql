-- Defensive repair for installations upgraded through several development snapshots.
-- All operations are idempotent so existing correct data is preserved.

ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS commission_debt NUMERIC(16, 2) NOT NULL DEFAULT 0;

ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS owner_type VARCHAR(30) NOT NULL DEFAULT 'HOTEL_ADMIN';

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

-- Normalize legacy nulls before Hibernate reads the rows.
UPDATE wallets SET commission_debt = 0 WHERE commission_debt IS NULL;
UPDATE withdrawal_requests SET owner_type = 'HOTEL_ADMIN' WHERE owner_type IS NULL OR owner_type = '';
UPDATE payments SET commission_rate = 0 WHERE commission_rate IS NULL;
UPDATE payments SET commission_amount = 0 WHERE commission_amount IS NULL;
UPDATE payments SET hotel_net_amount = GREATEST(amount - COALESCE(commission_amount, 0), 0)
WHERE hotel_net_amount IS NULL;
UPDATE payments SET booking_applied = FALSE WHERE booking_applied IS NULL;
UPDATE payments SET wallet_applied = FALSE WHERE wallet_applied IS NULL;
UPDATE payments SET revenue_released = FALSE WHERE revenue_released IS NULL;

ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_owner_type;
ALTER TABLE wallets
    ADD CONSTRAINT ck_wallets_owner_type
        CHECK (owner_type IN ('PLATFORM', 'HOTEL_ADMIN', 'CUSTOMER'));

ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_balances;
ALTER TABLE wallets
    ADD CONSTRAINT ck_wallets_balances CHECK (
        available_balance >= 0
        AND pending_balance >= 0
        AND locked_balance >= 0
        AND commission_debt >= 0
        AND total_earned >= 0
        AND total_withdrawn >= 0
    );

ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS ck_withdrawal_owner_type;
ALTER TABLE withdrawal_requests
    ADD CONSTRAINT ck_withdrawal_owner_type
        CHECK (owner_type IN ('HOTEL_ADMIN', 'CUSTOMER'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_method CHECK (
        method IN ('CASH', 'BANK_TRANSFER', 'MOMO', 'VNPAY', 'PAYOS', 'CREDIT_CARD', 'WALLET')
    );

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_status;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_status CHECK (
        status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED')
    );

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS ck_wallet_transaction_type;
ALTER TABLE wallet_transactions
    ADD CONSTRAINT ck_wallet_transaction_type CHECK (
        type IN (
            'PLATFORM_COMMISSION',
            'HOTEL_REVENUE_PENDING',
            'HOTEL_REVENUE_RELEASED',
            'WALLET_TOP_UP',
            'WITHDRAWAL_HOLD',
            'WITHDRAWAL_RELEASED',
            'WITHDRAWAL_PAID',
            'REFUND_DEBIT',
            'MANUAL_ADJUSTMENT',
            'CUSTOMER_REFUND_CREDIT',
            'CUSTOMER_PAYMENT_DEBIT',
            'CASH_REVENUE_RECORDED',
            'HOTEL_COMMISSION_DEBIT',
            'HOTEL_COMMISSION_DEBT_ACCRUED',
            'HOTEL_COMMISSION_DEBT_SETTLED'
        )
    );

-- Create the platform wallet once so the System Admin dashboard always has a concrete row.
INSERT INTO wallets (
    id,
    owner_type,
    owner_id,
    available_balance,
    pending_balance,
    locked_balance,
    commission_debt,
    total_earned,
    total_withdrawn,
    version,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'PLATFORM',
    '00000000-0000-0000-0000-000000000001',
    0, 0, 0, 0, 0, 0, 0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (owner_type, owner_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_payments_hotel_owner
    ON payments (hotel_owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_owner_type
    ON withdrawal_requests (owner_type, hotel_owner_id, requested_at DESC);
