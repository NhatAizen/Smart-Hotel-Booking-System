ALTER TABLE rooms
    ADD COLUMN approval_status VARCHAR(30);

ALTER TABLE rooms
    ADD COLUMN rejection_reason VARCHAR(500);

ALTER TABLE rooms
    ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE rooms
    ADD COLUMN reviewed_by UUID;

UPDATE rooms
SET approval_status = 'APPROVED'
WHERE approval_status IS NULL;

ALTER TABLE rooms
    ALTER COLUMN approval_status
    SET DEFAULT 'PENDING';

ALTER TABLE rooms
    ALTER COLUMN approval_status
    SET NOT NULL;

ALTER TABLE rooms
    ADD CONSTRAINT ck_rooms_approval_status
        CHECK (
            approval_status IN (
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        );

CREATE INDEX idx_rooms_approval_status
    ON rooms (approval_status);

CREATE INDEX idx_rooms_hotel_approval
    ON rooms (hotel_id, approval_status);