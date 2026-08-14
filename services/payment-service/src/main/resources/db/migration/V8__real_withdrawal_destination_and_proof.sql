ALTER TABLE withdrawal_requests
    ADD COLUMN IF NOT EXISTS payout_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS receiver_qr_data BYTEA,
    ADD COLUMN IF NOT EXISTS receiver_qr_content_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS receiver_qr_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS transfer_proof_data BYTEA,
    ADD COLUMN IF NOT EXISTS transfer_proof_content_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS transfer_proof_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS paid_by UUID;

UPDATE withdrawal_requests
SET payout_method = 'BANK_ACCOUNT'
WHERE payout_method IS NULL;

ALTER TABLE withdrawal_requests
    ALTER COLUMN payout_method SET NOT NULL,
    ALTER COLUMN bank_name DROP NOT NULL,
    ALTER COLUMN bank_bin DROP NOT NULL,
    ALTER COLUMN account_number DROP NOT NULL,
    ALTER COLUMN account_name DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_withdrawal_payout_method'
    ) THEN
        ALTER TABLE withdrawal_requests
            ADD CONSTRAINT ck_withdrawal_payout_method CHECK (
                payout_method IN ('BANK_ACCOUNT', 'PERSONAL_QR', 'BANK_AND_QR')
            );
    END IF;
END $$;
