CREATE TABLE IF NOT EXISTS saved_promotions (
    id UUID PRIMARY KEY,
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_saved_promotion_user UNIQUE (promotion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_promotions_user
    ON saved_promotions(user_id, saved_at DESC);
