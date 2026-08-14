ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS ward VARCHAR(100),
    ADD COLUMN IF NOT EXISTS district VARCHAR(100),
    ADD COLUMN IF NOT EXISTS check_in_time TIME,
    ADD COLUMN IF NOT EXISTS check_out_time TIME;

ALTER TABLE hotels
    ALTER COLUMN approval_status SET DEFAULT 'DRAFT';

ALTER TABLE hotels
    DROP CONSTRAINT IF EXISTS ck_hotels_approval_status;

ALTER TABLE hotels
    ADD CONSTRAINT ck_hotels_approval_status
        CHECK (approval_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE TABLE IF NOT EXISTS hotel_amenities
(
    hotel_id UUID NOT NULL,
    amenity VARCHAR(100) NOT NULL,
    CONSTRAINT fk_hotel_amenities_hotel
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
    CONSTRAINT uq_hotel_amenity UNIQUE (hotel_id, amenity)
);

CREATE INDEX IF NOT EXISTS idx_hotel_amenities_hotel_id
    ON hotel_amenities (hotel_id);

CREATE TABLE IF NOT EXISTS hotel_images
(
    id UUID PRIMARY KEY,
    hotel_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(100),
    file_size BIGINT NOT NULL,
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hotel_images_hotel
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hotel_images_hotel_id
    ON hotel_images (hotel_id);

ALTER TABLE room_types
    ADD COLUMN IF NOT EXISTS bed_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS refundable BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS smoking_allowed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE room_types
    DROP CONSTRAINT IF EXISTS ck_room_types_bed_count;

ALTER TABLE room_types
    ADD CONSTRAINT ck_room_types_bed_count CHECK (bed_count >= 1);

CREATE TABLE IF NOT EXISTS room_type_amenities
(
    room_type_id UUID NOT NULL,
    amenity VARCHAR(100) NOT NULL,
    CONSTRAINT fk_room_type_amenities_room_type
        FOREIGN KEY (room_type_id) REFERENCES room_types (id) ON DELETE CASCADE,
    CONSTRAINT uq_room_type_amenity UNIQUE (room_type_id, amenity)
);

CREATE INDEX IF NOT EXISTS idx_room_type_amenities_room_type_id
    ON room_type_amenities (room_type_id);

CREATE TABLE IF NOT EXISTS room_type_images
(
    id UUID PRIMARY KEY,
    room_type_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(100),
    file_size BIGINT NOT NULL,
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_room_type_images_room_type
        FOREIGN KEY (room_type_id) REFERENCES room_types (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_room_type_images_room_type_id
    ON room_type_images (room_type_id);
