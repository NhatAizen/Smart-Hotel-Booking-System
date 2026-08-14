CREATE TABLE wallets
(
    id UUID PRIMARY KEY,
    owner_type VARCHAR(30) NOT NULL,
    owner_id UUID NOT NULL,
    available_balance NUMERIC(16, 2) NOT NULL DEFAULT 0,
    pending_balance NUMERIC(16, 2) NOT NULL DEFAULT 0,
    locked_balance NUMERIC(16, 2) NOT NULL DEFAULT 0,
    total_earned NUMERIC(16, 2) NOT NULL DEFAULT 0,
    total_withdrawn NUMERIC(16, 2) NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_wallets_owner UNIQUE (owner_type, owner_id),
    CONSTRAINT ck_wallets_owner_type CHECK (owner_type IN ('PLATFORM', 'HOTEL_ADMIN')),
    CONSTRAINT ck_wallets_balances CHECK (
        available_balance >= 0 AND pending_balance >= 0 AND locked_balance >= 0
        AND total_earned >= 0 AND total_withdrawn >= 0
    )
);

CREATE TABLE withdrawal_requests
(
    id UUID PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    hotel_owner_id UUID NOT NULL,
    amount NUMERIC(16, 2) NOT NULL,
    bank_name VARCHAR(120) NOT NULL,
    bank_bin VARCHAR(20) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(180) NOT NULL,
    status VARCHAR(30) NOT NULL,
    reviewed_by UUID,
    review_note VARCHAR(500),
    payout_id VARCHAR(150),
    payout_reference VARCHAR(150),
    failure_reason VARCHAR(1000),
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_withdrawal_amount CHECK (amount >= 10000),
    CONSTRAINT ck_withdrawal_status CHECK (
        status IN ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED', 'CANCELLED')
    )
);

CREATE INDEX idx_withdrawals_owner ON withdrawal_requests (hotel_owner_id, requested_at DESC);
CREATE INDEX idx_withdrawals_status ON withdrawal_requests (status, requested_at);

CREATE TABLE wallet_transactions
(
    id UUID PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    payment_order_id UUID REFERENCES payment_orders(id) ON DELETE RESTRICT,
    withdrawal_id UUID REFERENCES withdrawal_requests(id) ON DELETE RESTRICT,
    type VARCHAR(40) NOT NULL,
    amount NUMERIC(16, 2) NOT NULL,
    description VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_wallet_transaction_type CHECK (
        type IN (
            'PLATFORM_COMMISSION', 'HOTEL_REVENUE_PENDING', 'HOTEL_REVENUE_RELEASED', 'WALLET_TOP_UP',
            'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASED', 'WITHDRAWAL_PAID',
            'REFUND_DEBIT', 'MANUAL_ADJUSTMENT'
        )
    )
);

CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions (wallet_id, created_at DESC);
CREATE UNIQUE INDEX uq_wallet_tx_payment_type
    ON wallet_transactions (wallet_id, payment_id, type)
    WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_wallet_tx_order_type
    ON wallet_transactions (wallet_id, payment_order_id, type)
    WHERE payment_order_id IS NOT NULL;
