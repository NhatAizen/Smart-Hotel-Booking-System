-- Partner onboarding only verifies identity/legal eligibility.
-- Bank details belong to the withdrawal/disbursement flow, not partner onboarding.
ALTER TABLE partner_requests
    DROP COLUMN IF EXISTS payout_bank_name,
    DROP COLUMN IF EXISTS payout_bank_bin,
    DROP COLUMN IF EXISTS payout_account_number,
    DROP COLUMN IF EXISTS payout_account_name;
