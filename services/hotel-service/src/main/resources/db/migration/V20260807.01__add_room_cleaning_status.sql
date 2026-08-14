ALTER TABLE rooms
    DROP CONSTRAINT IF EXISTS ck_rooms_status;

ALTER TABLE rooms
    ADD CONSTRAINT ck_rooms_status
        CHECK (
            status IN (
                'AVAILABLE',
                'OCCUPIED',
                'CLEANING',
                'MAINTENANCE',
                'INACTIVE'
            )
        );
