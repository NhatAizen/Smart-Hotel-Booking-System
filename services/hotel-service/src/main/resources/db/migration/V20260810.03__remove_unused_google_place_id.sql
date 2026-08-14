-- Google Maps is no longer used. Keep the older Flyway migration in history,
-- but remove the unused column from the current schema.
ALTER TABLE hotels
    DROP COLUMN IF EXISTS google_place_id;
