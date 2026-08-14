-- A partner account can stop and later apply again. Keep every completed
-- application immutable and represent each new application as a new row.
ALTER TABLE partner_requests
    DROP CONSTRAINT IF EXISTS partner_requests_user_id_key;

DROP INDEX IF EXISTS partner_requests_user_id_key;

CREATE UNIQUE INDEX ux_partner_requests_pending_user
    ON partner_requests(user_id)
    WHERE status = 'PENDING';

CREATE INDEX idx_partner_requests_user_created
    ON partner_requests(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION enforce_partner_request_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('APPROVED', 'REJECTED')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Completed partner request status is immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_partner_request_terminal_status
BEFORE UPDATE OF status ON partner_requests
FOR EACH ROW
EXECUTE FUNCTION enforce_partner_request_terminal_status();
