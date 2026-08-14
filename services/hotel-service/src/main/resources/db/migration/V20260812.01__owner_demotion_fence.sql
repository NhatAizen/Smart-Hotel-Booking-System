CREATE TABLE IF NOT EXISTS owner_demotion_fences (
    owner_id UUID PRIMARY KEY,
    transition_id UUID,
    frozen BOOLEAN NOT NULL DEFAULT FALSE,
    frozen_at TIMESTAMPTZ,
    unfrozen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_owner_demotion_fence_state CHECK (
        (frozen = TRUE AND transition_id IS NOT NULL AND frozen_at IS NOT NULL)
        OR frozen = FALSE
    )
);

