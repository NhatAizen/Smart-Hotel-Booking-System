CREATE TABLE room_types
(
    id UUID PRIMARY KEY,

    hotel_id UUID NOT NULL,

    name VARCHAR(120) NOT NULL,

    description TEXT,

    base_price NUMERIC(12, 2) NOT NULL,

    max_adults INTEGER NOT NULL,

    max_children INTEGER NOT NULL DEFAULT 0,

    bed_type VARCHAR(80),

    area_sqm NUMERIC(8, 2),

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_room_types_hotel
        FOREIGN KEY (hotel_id)
        REFERENCES hotels (id)
        ON DELETE CASCADE,

    CONSTRAINT uq_room_types_hotel_name
        UNIQUE (hotel_id, name),

    CONSTRAINT ck_room_types_base_price
        CHECK (base_price >= 0),

    CONSTRAINT ck_room_types_max_adults
        CHECK (max_adults >= 1),

    CONSTRAINT ck_room_types_max_children
        CHECK (max_children >= 0),

    CONSTRAINT ck_room_types_area
        CHECK (area_sqm IS NULL OR area_sqm > 0),

    CONSTRAINT ck_room_types_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_room_types_hotel_id
    ON room_types (hotel_id);

CREATE INDEX idx_room_types_status
    ON room_types (status);


CREATE TABLE rooms
(
    id UUID PRIMARY KEY,

    hotel_id UUID NOT NULL,

    room_type_id UUID NOT NULL,

    room_number VARCHAR(40) NOT NULL,

    floor INTEGER,

    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',

    custom_price NUMERIC(12, 2),

    note VARCHAR(500),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_rooms_hotel
        FOREIGN KEY (hotel_id)
        REFERENCES hotels (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_rooms_room_type
        FOREIGN KEY (room_type_id)
        REFERENCES room_types (id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_rooms_hotel_number
        UNIQUE (hotel_id, room_number),

    CONSTRAINT ck_rooms_custom_price
        CHECK (custom_price IS NULL OR custom_price >= 0),

    CONSTRAINT ck_rooms_status
        CHECK (
            status IN (
                'AVAILABLE',
                'OCCUPIED',
                'MAINTENANCE',
                'INACTIVE'
            )
        )
);

CREATE INDEX idx_rooms_hotel_id
    ON rooms (hotel_id);

CREATE INDEX idx_rooms_room_type_id
    ON rooms (room_type_id);

CREATE INDEX idx_rooms_status
    ON rooms (status);
