ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_email_sent_at TIMESTAMPTZ;
-- New bookings opt in when the invoice request is saved. Do not email historical customers in bulk.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_email_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_pending_invoice_email ON bookings (created_at, id)
    WHERE invoice_requested = true AND invoice_email_sent_at IS NULL AND invoice_email_requested_at IS NOT NULL;
