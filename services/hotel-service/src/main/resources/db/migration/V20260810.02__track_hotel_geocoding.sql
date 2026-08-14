ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS geocoding_attempted_at TIMESTAMPTZ;

ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

ALTER TABLE hotels
    ADD COLUMN IF NOT EXISTS geocoded_address VARCHAR(500);

-- Các khách sạn đã có tọa độ từ trước được xem là đã định vị thành công.
-- Các khách sạn chưa có tọa độ giữ geocoding_attempted_at = NULL để runner
-- thực hiện backfill đúng một lần sau khi service khởi động.
UPDATE hotels
SET geocoding_attempted_at = COALESCE(geocoding_attempted_at, updated_at, created_at, NOW()),
    geocoded_at = COALESCE(geocoded_at, updated_at, created_at, NOW())
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;
