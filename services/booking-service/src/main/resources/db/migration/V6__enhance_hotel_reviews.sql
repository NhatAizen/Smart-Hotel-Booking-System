ALTER TABLE hotel_reviews
    ADD COLUMN IF NOT EXISTS room_type_id UUID,
    ADD COLUMN IF NOT EXISTS check_in DATE,
    ADD COLUMN IF NOT EXISTS check_out DATE,
    ADD COLUMN IF NOT EXISTS adults INTEGER,
    ADD COLUMN IF NOT EXISTS children INTEGER,
    ADD COLUMN IF NOT EXISTS trip_type VARCHAR(24),
    ADD COLUMN IF NOT EXISTS review_language VARCHAR(12),
    ADD COLUMN IF NOT EXISTS staff_rating INTEGER,
    ADD COLUMN IF NOT EXISTS facilities_rating INTEGER,
    ADD COLUMN IF NOT EXISTS cleanliness_rating INTEGER,
    ADD COLUMN IF NOT EXISTS comfort_rating INTEGER,
    ADD COLUMN IF NOT EXISTS value_rating INTEGER,
    ADD COLUMN IF NOT EXISTS location_rating INTEGER,
    ADD COLUMN IF NOT EXISTS wifi_rating INTEGER,
    ADD COLUMN IF NOT EXISTS positive_comment TEXT,
    ADD COLUMN IF NOT EXISTS negative_comment TEXT;

UPDATE hotel_reviews
SET staff_rating = COALESCE(staff_rating, rating),
    facilities_rating = COALESCE(facilities_rating, rating),
    cleanliness_rating = COALESCE(cleanliness_rating, rating),
    comfort_rating = COALESCE(comfort_rating, rating),
    value_rating = COALESCE(value_rating, rating),
    location_rating = COALESCE(location_rating, rating),
    review_language = COALESCE(review_language, 'vi'),
    trip_type = COALESCE(trip_type, 'OTHER'),
    positive_comment = COALESCE(NULLIF(positive_comment, ''), comment)
WHERE staff_rating IS NULL
   OR facilities_rating IS NULL
   OR cleanliness_rating IS NULL
   OR comfort_rating IS NULL
   OR value_rating IS NULL
   OR location_rating IS NULL
   OR review_language IS NULL
   OR trip_type IS NULL
   OR positive_comment IS NULL;

ALTER TABLE hotel_reviews
    ALTER COLUMN staff_rating SET NOT NULL,
    ALTER COLUMN facilities_rating SET NOT NULL,
    ALTER COLUMN cleanliness_rating SET NOT NULL,
    ALTER COLUMN comfort_rating SET NOT NULL,
    ALTER COLUMN value_rating SET NOT NULL,
    ALTER COLUMN location_rating SET NOT NULL,
    ALTER COLUMN review_language SET NOT NULL,
    ALTER COLUMN trip_type SET NOT NULL,
    ALTER COLUMN positive_comment SET NOT NULL;

ALTER TABLE hotel_reviews
    ADD CONSTRAINT ck_hotel_reviews_staff_rating CHECK (staff_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_facilities_rating CHECK (facilities_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_cleanliness_rating CHECK (cleanliness_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_comfort_rating CHECK (comfort_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_value_rating CHECK (value_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_location_rating CHECK (location_rating BETWEEN 1 AND 10),
    ADD CONSTRAINT ck_hotel_reviews_wifi_rating CHECK (wifi_rating IS NULL OR wifi_rating BETWEEN 1 AND 10);

CREATE TABLE hotel_review_images
(
    review_id UUID NOT NULL,
    sort_order INTEGER NOT NULL,
    image_url VARCHAR(1000) NOT NULL,
    PRIMARY KEY (review_id, sort_order),
    CONSTRAINT fk_hotel_review_images_review
        FOREIGN KEY (review_id)
        REFERENCES hotel_reviews(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_hotel_review_images_review
    ON hotel_review_images (review_id, sort_order);
