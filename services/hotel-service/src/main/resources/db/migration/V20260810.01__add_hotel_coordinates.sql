ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_hotels_coordinates
    ON hotels (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Google Place ID chỉ thuộc bản thử Google Maps trước đó; OpenStreetMap dùng tọa độ trực tiếp.
ALTER TABLE hotels
    DROP COLUMN IF EXISTS google_place_id;
