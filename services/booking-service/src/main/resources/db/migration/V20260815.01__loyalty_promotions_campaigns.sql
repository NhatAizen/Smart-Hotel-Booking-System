CREATE TABLE membership_tiers (
    level INTEGER PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    min_completed_bookings INTEGER NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO membership_tiers(level,name,min_completed_bookings,discount_percent,active) VALUES
(1,'Cấp 1',0,2.00,TRUE),(2,'Cấp 2',5,5.00,TRUE),(3,'Cấp 3',15,8.00,TRUE);

CREATE TABLE promotions (
    id UUID PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
    description VARCHAR(600), scope VARCHAR(20) NOT NULL, hotel_id UUID,
    discount_type VARCHAR(20) NOT NULL, discount_value NUMERIC(14,2) NOT NULL,
    max_discount NUMERIC(14,2), min_booking_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
    usage_limit INTEGER, usage_per_user INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE, funding_source VARCHAR(20) NOT NULL,
    created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_promotion_scope_hotel CHECK ((scope='HOTEL' AND hotel_id IS NOT NULL) OR scope='PLATFORM')
);
CREATE INDEX idx_promotions_hotel ON promotions(hotel_id);
CREATE INDEX idx_promotions_scope_active ON promotions(scope,active,start_at,end_at);

CREATE TABLE promotion_usages (
    id UUID PRIMARY KEY, promotion_id UUID NOT NULL REFERENCES promotions(id), user_id UUID NOT NULL,
    booking_group_id UUID NOT NULL, discount_amount NUMERIC(14,2) NOT NULL, used_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_promotion_group UNIQUE(promotion_id,booking_group_id)
);
CREATE INDEX idx_promotion_usage_user ON promotion_usages(promotion_id,user_id);

CREATE TABLE campaigns (
    id UUID PRIMARY KEY, name VARCHAR(160) NOT NULL, title VARCHAR(220) NOT NULL,
    description VARCHAR(800), badge_text VARCHAR(80), promotion_id UUID REFERENCES promotions(id),
    start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_campaign_active_time ON campaigns(active,start_at,end_at);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS membership_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS membership_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hotel_promotion_code VARCHAR(40);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hotel_promotion_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_promotion_code VARCHAR(40);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_promotion_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
UPDATE bookings SET gross_amount = GREATEST(total_price - COALESCE(late_checkout_fee,0),0) WHERE gross_amount=0;
