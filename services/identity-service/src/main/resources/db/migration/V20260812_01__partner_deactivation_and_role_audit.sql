CREATE TABLE partner_deactivation_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    rejection_reason VARCHAR(500),
    reviewed_by UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_partner_deactivation_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_partner_deactivation_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_partner_deactivation_status
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX ux_partner_deactivation_pending_user
    ON partner_deactivation_requests(user_id)
    WHERE status = 'PENDING';

CREATE INDEX idx_partner_deactivation_status_requested
    ON partner_deactivation_requests(status, requested_at);

CREATE INDEX idx_partner_deactivation_user_requested
    ON partner_deactivation_requests(user_id, requested_at DESC);

CREATE TABLE user_role_change_audits (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_full_name VARCHAR(150) NOT NULL,
    old_role VARCHAR(30) NOT NULL,
    new_role VARCHAR(30) NOT NULL,
    changed_by UUID NOT NULL,
    changed_by_email VARCHAR(255) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(1000) NOT NULL,
    source VARCHAR(40) NOT NULL,
    source_request_id UUID,

    CONSTRAINT fk_user_role_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_role_audit_actor
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_user_role_audit_transition
        CHECK (
            (old_role = 'CUSTOMER' AND new_role = 'HOTEL_ADMIN')
            OR
            (old_role = 'HOTEL_ADMIN' AND new_role = 'CUSTOMER')
        ),
    CONSTRAINT ck_user_role_audit_source
        CHECK (source IN ('ADMIN_DIRECT', 'PARTNER_APPROVAL', 'PARTNER_DEACTIVATION'))
);

CREATE INDEX idx_user_role_audit_user_changed
    ON user_role_change_audits(user_id, changed_at DESC);

CREATE INDEX idx_user_role_audit_actor_changed
    ON user_role_change_audits(changed_by, changed_at DESC);

CREATE OR REPLACE FUNCTION reject_user_role_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'User role change audit rows are append-only'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_user_role_audit_append_only
BEFORE UPDATE OR DELETE ON user_role_change_audits
FOR EACH ROW
EXECUTE FUNCTION reject_user_role_audit_mutation();

--
-- Every role mutation is checked and audited at commit time. New role-change APIs
-- provide the actor/reason/source through transaction-local PostgreSQL settings.
-- Every application path supplies actor, reason, source and source request through
-- transaction-local settings before changing the user role.
--
CREATE OR REPLACE FUNCTION enforce_and_audit_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    audit_actor UUID;
    audit_reason VARCHAR(1000);
    audit_source VARCHAR(40);
    audit_source_request UUID;
    audit_actor_email VARCHAR(255);
BEGIN
    IF OLD.role = 'SYSTEM_ADMIN' OR NEW.role = 'SYSTEM_ADMIN' THEN
        RAISE EXCEPTION 'SYSTEM_ADMIN role cannot be changed'
            USING ERRCODE = '23514';
    END IF;

    IF NOT (
        (OLD.role = 'CUSTOMER' AND NEW.role = 'HOTEL_ADMIN')
        OR
        (OLD.role = 'HOTEL_ADMIN' AND NEW.role = 'CUSTOMER')
    ) THEN
        RAISE EXCEPTION 'Only CUSTOMER and HOTEL_ADMIN may be converted'
            USING ERRCODE = '23514';
    END IF;

    BEGIN
        audit_actor := NULLIF(
            current_setting('enziu.role_change_actor_id', TRUE),
            ''
        )::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        audit_actor := NULL;
    END;

    audit_reason := NULLIF(
        current_setting('enziu.role_change_reason', TRUE),
        ''
    );
    audit_source := NULLIF(
        current_setting('enziu.role_change_source', TRUE),
        ''
    );

    BEGIN
        audit_source_request := NULLIF(
            current_setting('enziu.role_change_source_request_id', TRUE),
            ''
        )::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        audit_source_request := NULL;
    END;

    IF audit_actor IS NULL OR audit_reason IS NULL OR audit_source IS NULL THEN
        RAISE EXCEPTION 'Role change audit context is required'
            USING ERRCODE = '23514';
    END IF;

    IF audit_source NOT IN (
        'ADMIN_DIRECT',
        'PARTNER_APPROVAL',
        'PARTNER_DEACTIVATION'
    ) THEN
        RAISE EXCEPTION 'Invalid role change audit source'
            USING ERRCODE = '23514';
    END IF;

    SELECT actor.email
    INTO audit_actor_email
    FROM users actor
    WHERE actor.id = audit_actor;

    IF audit_actor_email IS NULL THEN
        RAISE EXCEPTION 'Role change actor does not exist'
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO user_role_change_audits (
        id,
        user_id,
        user_email,
        user_full_name,
        old_role,
        new_role,
        changed_by,
        changed_by_email,
        changed_at,
        reason,
        source,
        source_request_id
    ) VALUES (
        gen_random_uuid(),
        NEW.id,
        NEW.email,
        NEW.full_name,
        OLD.role,
        NEW.role,
        audit_actor,
        audit_actor_email,
        CURRENT_TIMESTAMP,
        audit_reason,
        audit_source,
        audit_source_request
    );

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_enforce_and_audit_user_role_change
AFTER UPDATE ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION enforce_and_audit_user_role_change();
