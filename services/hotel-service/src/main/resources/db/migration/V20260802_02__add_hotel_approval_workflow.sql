-- ============================================================
-- Hotel Approval Workflow
-- ============================================================

-- 1. Thêm các cột mới
ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30);

ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500);

ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS reviewed_by UUID;

ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;


-- 2. Khách sạn cũ mặc định được duyệt
UPDATE hotels
SET approval_status = 'APPROVED'
WHERE approval_status IS NULL;


-- 3. Thiết lập mặc định và NOT NULL
ALTER TABLE hotels
    ALTER COLUMN approval_status
    SET DEFAULT 'PENDING';

ALTER TABLE hotels
    ALTER COLUMN approval_status
    SET NOT NULL;


-- 4. Constraint
ALTER TABLE hotels
    DROP CONSTRAINT IF EXISTS ck_hotels_approval_status;

ALTER TABLE hotels
    ADD CONSTRAINT ck_hotels_approval_status
    CHECK (
        approval_status IN (
            'PENDING',
            'APPROVED',
            'REJECTED'
        )
    );


-- 5. Index
CREATE INDEX IF NOT EXISTS idx_hotels_approval_status
ON hotels (approval_status);

CREATE INDEX IF NOT EXISTS idx_hotels_owner_id
ON hotels (owner_id);