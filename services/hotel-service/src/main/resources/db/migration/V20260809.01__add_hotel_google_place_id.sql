ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_hotels_google_place_id
    ON hotels (google_place_id)
    WHERE google_place_id IS NOT NULL;
