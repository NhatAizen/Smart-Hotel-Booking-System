ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_owner_type;
ALTER TABLE wallets
    ADD CONSTRAINT ck_wallets_owner_type
        CHECK (owner_type IN ('PLATFORM', 'HOTEL_ADMIN', 'CUSTOMER'));

ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS owner_type VARCHAR(30) NOT NULL DEFAULT 'HOTEL_ADMIN';

ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS ck_withdrawal_owner_type;
ALTER TABLE withdrawal_requests
    ADD CONSTRAINT ck_withdrawal_owner_type
        CHECK (owner_type IN ('HOTEL_ADMIN', 'CUSTOMER'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method;
ALTER TABLE payments
    ADD CONSTRAINT ck_payments_method CHECK (
        method IN ('CASH', 'BANK_TRANSFER', 'MOMO', 'VNPAY', 'PAYOS', 'CREDIT_CARD', 'WALLET')
    );

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS ck_wallet_transaction_type;
ALTER TABLE wallet_transactions
    ADD CONSTRAINT ck_wallet_transaction_type CHECK (
        type IN (
            'PLATFORM_COMMISSION', 'HOTEL_REVENUE_PENDING', 'HOTEL_REVENUE_RELEASED', 'WALLET_TOP_UP',
            'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASED', 'WITHDRAWAL_PAID',
            'REFUND_DEBIT', 'MANUAL_ADJUSTMENT',
            'CUSTOMER_REFUND_CREDIT', 'CUSTOMER_PAYMENT_DEBIT',
            'CASH_REVENUE_RECORDED', 'HOTEL_COMMISSION_DEBIT'
        )
    );

CREATE INDEX IF NOT EXISTS idx_withdrawals_owner_type
    ON withdrawal_requests (owner_type, hotel_owner_id, requested_at DESC);
