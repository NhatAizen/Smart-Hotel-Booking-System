-- Phòng vật lý do Hotel Admin tự quản lý, không cần System Admin duyệt.
DROP INDEX IF EXISTS idx_rooms_approval_status;
DROP INDEX IF EXISTS idx_rooms_hotel_approval;

ALTER TABLE rooms
    DROP CONSTRAINT IF EXISTS ck_rooms_approval_status;

ALTER TABLE rooms
    DROP COLUMN IF EXISTS approval_status,
    DROP COLUMN IF EXISTS rejection_reason,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by;
