-- Retry coordinates produced by the first fuzzy Nominatim implementation.
-- Auto-geocoded rows have geocoded_address populated; manually supplied coordinates do not.
UPDATE hotels
SET latitude = NULL,
    longitude = NULL,
    geocoding_attempted_at = NULL,
    geocoded_at = NULL,
    geocoded_address = NULL
WHERE geocoded_address IS NOT NULL;

-- Retry prior NOT_FOUND rows once with the stricter street/city matcher.
UPDATE hotels
SET geocoding_attempted_at = NULL,
    geocoded_at = NULL,
    geocoded_address = NULL
WHERE (latitude IS NULL OR longitude IS NULL)
  AND geocoding_attempted_at IS NOT NULL;
