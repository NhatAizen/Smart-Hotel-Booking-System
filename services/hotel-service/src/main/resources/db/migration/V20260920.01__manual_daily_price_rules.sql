-- Management-only manual prices. Booking Service does not read this table yet.
CREATE TABLE manual_daily_price_rules (
    id UUID PRIMARY KEY,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    nightly_price NUMERIC(12, 2) NOT NULL,
    approved_base_price_at_save NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_manual_price_dates CHECK (start_date <= end_date),
    CONSTRAINT ck_manual_price_positive CHECK (nightly_price > 0 AND approved_base_price_at_save > 0)
);

CREATE INDEX idx_manual_price_rules_hotel
    ON manual_daily_price_rules (hotel_id, start_date, id);
CREATE INDEX idx_manual_price_rules_overlap
    ON manual_daily_price_rules (room_type_id, start_date, end_date);
