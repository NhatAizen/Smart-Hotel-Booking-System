ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) NOT NULL DEFAULT 'FULL_PAYMENT';

ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS ck_payments_payment_type;

ALTER TABLE payments
    ADD CONSTRAINT ck_payments_payment_type
        CHECK (payment_type IN ('DEPOSIT', 'FULL_PAYMENT', 'REMAINING_PAYMENT'));

CREATE INDEX IF NOT EXISTS idx_payments_payment_type
    ON payments (payment_type);
