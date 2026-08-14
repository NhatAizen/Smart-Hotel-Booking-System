CREATE TABLE IF NOT EXISTS hotel_admin_demotion_fences (
    owner_id UUID PRIMARY KEY,
    transition_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hotel_admin_demotion_fences_active
    ON hotel_admin_demotion_fences (transition_id)
    WHERE transition_id IS NOT NULL;

COMMENT ON TABLE hotel_admin_demotion_fences IS
    'Persistent per-owner serialization row for HOTEL_ADMIN demotion transitions';
COMMENT ON COLUMN hotel_admin_demotion_fences.transition_id IS
    'Non-null while a role demotion transition owns the financial mutation fence';
