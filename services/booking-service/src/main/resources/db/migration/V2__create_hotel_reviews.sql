CREATE TABLE hotel_reviews
(
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    hotel_id UUID NOT NULL,
    rating INTEGER NOT NULL,
    title VARCHAR(180),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_hotel_reviews_rating CHECK (rating BETWEEN 1 AND 10)
);

CREATE INDEX idx_hotel_reviews_hotel_created
    ON hotel_reviews (hotel_id, created_at DESC);

CREATE INDEX idx_hotel_reviews_customer
    ON hotel_reviews (customer_id);
