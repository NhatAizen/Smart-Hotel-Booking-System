-- Existing HOTEL_ADMIN wallets pool money by account, including top-ups and withdrawals.
-- Keep every existing wallet and balance untouched. HOTEL wallets are separate and
-- start at zero; a later reconciliation must explicitly fund them per hotel.
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallets_owner_type;
ALTER TABLE wallets ADD CONSTRAINT ck_wallets_owner_type
    CHECK (owner_type IN ('PLATFORM', 'HOTEL_ADMIN', 'HOTEL', 'CUSTOMER'));

CREATE TABLE hotel_customer_transfers (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    hotel_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    amount NUMERIC(16, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_hotel_customer_transfer_amount CHECK (amount > 0 AND amount = ROUND(amount)),
    CONSTRAINT ck_hotel_customer_transfer_status CHECK (
        (status = 'RESERVED' AND completed_at IS NULL)
        OR (status = 'COMPLETED' AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_hotel_customer_transfers_booking
    ON hotel_customer_transfers (booking_id);

ALTER TABLE wallet_transactions
    ADD COLUMN transfer_id UUID REFERENCES hotel_customer_transfers(id) ON DELETE RESTRICT;

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS ck_wallet_transaction_type;
ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transaction_type CHECK (
    type IN (
        'PLATFORM_COMMISSION', 'HOTEL_REVENUE_PENDING', 'HOTEL_REVENUE_RELEASED',
        'WALLET_TOP_UP', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASED', 'WITHDRAWAL_PAID',
        'REFUND_DEBIT', 'MANUAL_ADJUSTMENT', 'CUSTOMER_REFUND_CREDIT',
        'CUSTOMER_PAYMENT_DEBIT', 'CASH_REVENUE_RECORDED', 'HOTEL_COMMISSION_DEBIT',
        'HOTEL_COMMISSION_DEBT_ACCRUED', 'HOTEL_COMMISSION_DEBT_SETTLED',
        'HOTEL_TO_CUSTOMER_DEBIT', 'HOTEL_TO_CUSTOMER_CREDIT'
    )
);

ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transfer_link CHECK (
    (transfer_id IS NULL AND type NOT IN ('HOTEL_TO_CUSTOMER_DEBIT', 'HOTEL_TO_CUSTOMER_CREDIT'))
    OR (transfer_id IS NOT NULL AND type IN ('HOTEL_TO_CUSTOMER_DEBIT', 'HOTEL_TO_CUSTOMER_CREDIT'))
);

ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transfer_amount CHECK (
    (type = 'HOTEL_TO_CUSTOMER_DEBIT' AND amount < 0)
    OR (type = 'HOTEL_TO_CUSTOMER_CREDIT' AND amount > 0)
    OR (type NOT IN ('HOTEL_TO_CUSTOMER_DEBIT', 'HOTEL_TO_CUSTOMER_CREDIT'))
);

CREATE UNIQUE INDEX uq_wallet_tx_transfer_type
    ON wallet_transactions (transfer_id, type)
    WHERE transfer_id IS NOT NULL;

-- A completed transfer must have exactly one debit and one credit in one
-- payment-service transaction. The application keeps RESERVED rows uncommitted.
