ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS commission_debt NUMERIC(16, 2) NOT NULL DEFAULT 0;

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

-- Sửa dữ liệu cũ V5: commission CASH từng ăn nhầm vào pending của booking online.
-- Pending được dựng lại theo payment PAID + wallet_applied + chưa release.
-- Phần bị thiếu chuyển thành commission_debt.
WITH expected_pending AS (
    SELECT
        w.id AS wallet_id,
        COALESCE(SUM(p.hotel_net_amount), 0)::NUMERIC(16, 2) AS expected_amount
    FROM wallets w
    LEFT JOIN payments p
        ON p.hotel_owner_id = w.owner_id
       AND p.status = 'PAID'
       AND p.wallet_applied = TRUE
       AND p.revenue_released = FALSE
       AND p.method <> 'CASH'
    WHERE w.owner_type = 'HOTEL_ADMIN'
    GROUP BY w.id
),
repair AS (
    SELECT
        w.id,
        e.expected_amount,
        GREATEST(e.expected_amount - w.pending_balance, 0)::NUMERIC(16, 2) AS shortage
    FROM wallets w
    JOIN expected_pending e ON e.wallet_id = w.id
    WHERE w.owner_type = 'HOTEL_ADMIN'
)
UPDATE wallets w
SET
    pending_balance = r.expected_amount,
    commission_debt = w.commission_debt + r.shortage,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
FROM repair r
WHERE w.id = r.id
  AND (
      w.pending_balance <> r.expected_amount
      OR r.shortage > 0
  );

CREATE INDEX IF NOT EXISTS idx_payments_auto_settlement
    ON payments (status, wallet_applied, revenue_released, paid_at)
    WHERE status = 'PAID'
      AND wallet_applied = TRUE
      AND revenue_released = FALSE;
