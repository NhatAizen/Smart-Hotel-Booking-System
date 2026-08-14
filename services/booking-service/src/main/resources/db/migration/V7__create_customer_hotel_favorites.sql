CREATE TABLE IF NOT EXISTS customer_hotel_favorites (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL,
    hotel_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_hotel_favorites UNIQUE (customer_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_hotel_favorites_customer
    ON customer_hotel_favorites (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_hotel_favorites_hotel
    ON customer_hotel_favorites (hotel_id);
