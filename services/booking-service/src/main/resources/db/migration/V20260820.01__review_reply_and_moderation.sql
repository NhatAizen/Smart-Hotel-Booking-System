ALTER TABLE hotel_reviews
    ADD COLUMN IF NOT EXISTS hotel_reply TEXT,
    ADD COLUMN IF NOT EXISTS hotel_reply_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hotel_reply_by UUID,
    ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(16) NOT NULL DEFAULT 'VISIBLE',
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hidden_by UUID;

UPDATE hotel_reviews
SET moderation_status = 'VISIBLE'
WHERE moderation_status IS NULL OR BTRIM(moderation_status) = '';

ALTER TABLE hotel_reviews
    ALTER COLUMN moderation_status SET DEFAULT 'VISIBLE',
    ALTER COLUMN moderation_status SET NOT NULL;

ALTER TABLE hotel_reviews
    ADD CONSTRAINT ck_hotel_reviews_moderation_status
        CHECK (moderation_status IN ('VISIBLE', 'HIDDEN'));

CREATE INDEX IF NOT EXISTS idx_hotel_reviews_hotel_moderation_created
    ON hotel_reviews (hotel_id, moderation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotel_reviews_moderation_created
    ON hotel_reviews (moderation_status, created_at DESC);
