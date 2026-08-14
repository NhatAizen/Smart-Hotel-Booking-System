ALTER TABLE room_types
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500),
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID;

UPDATE room_types
SET approval_status = 'APPROVED'
WHERE approval_status IS NULL;

ALTER TABLE room_types
    ALTER COLUMN approval_status SET DEFAULT 'DRAFT',
    ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE room_types
    DROP CONSTRAINT IF EXISTS ck_room_types_approval_status;

ALTER TABLE room_types
    ADD CONSTRAINT ck_room_types_approval_status
    CHECK (approval_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_room_types_approval_status
    ON room_types (approval_status);
