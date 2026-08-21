ALTER TABLE room_types
    ADD COLUMN IF NOT EXISTS approved_base_price NUMERIC(12,2);

UPDATE room_types
SET approved_base_price = base_price
WHERE approval_status = 'APPROVED'
  AND approved_base_price IS NULL;
