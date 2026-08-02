CREATE TABLE bookings
(
    id UUID PRIMARY KEY,

    customer_id UUID NOT NULL,

    hotel_id UUID NOT NULL,

    room_id UUID NOT NULL,

    check_in DATE NOT NULL,

    check_out DATE NOT NULL,

    guest_count INTEGER NOT NULL,

    total_price NUMERIC(14, 2) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    special_request VARCHAR(1000),

    cancelled_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_bookings_date_range
        CHECK (check_out > check_in),

    CONSTRAINT ck_bookings_guest_count
        CHECK (guest_count >= 1),

    CONSTRAINT ck_bookings_total_price
        CHECK (total_price >= 0),

    CONSTRAINT ck_bookings_status
        CHECK (
            status IN (
                'PENDING',
                'CONFIRMED',
                'CHECKED_IN',
                'CHECKED_OUT',
                'CANCELLED'
            )
        )
);

CREATE INDEX idx_bookings_customer_id
    ON bookings (customer_id);

CREATE INDEX idx_bookings_room_id
    ON bookings (room_id);

CREATE INDEX idx_bookings_hotel_id
    ON bookings (hotel_id);

CREATE INDEX idx_bookings_status
    ON bookings (status);

CREATE INDEX idx_bookings_room_dates
    ON bookings (room_id, check_in, check_out);