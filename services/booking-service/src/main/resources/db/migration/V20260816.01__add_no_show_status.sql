ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS ck_bookings_status;

ALTER TABLE bookings
    ADD CONSTRAINT ck_bookings_status
        CHECK (
            status IN (
                'PENDING',
                'PENDING_PAYMENT',
                'CONFIRMED',
                'CHECKED_IN',
                'CHECKED_OUT',
                'NO_SHOW',
                'CANCELLED'
            )
        );
