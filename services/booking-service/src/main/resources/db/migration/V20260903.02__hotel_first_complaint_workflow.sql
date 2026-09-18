ALTER TABLE complaints
    ADD COLUMN escalated_at TIMESTAMPTZ,
    ADD COLUMN hotel_completed_at TIMESTAMPTZ,
    ADD COLUMN required_refund_amount NUMERIC(14, 2),
    ADD COLUMN hotel_reported_refund_amount NUMERIC(14, 2),
    ADD COLUMN resolved_by_role VARCHAR(30),
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

-- Preserve cases already handled by the system under the previous workflow.
UPDATE complaints c SET escalated_at = c.updated_at
WHERE c.resolved_by IS NOT NULL OR EXISTS (
    SELECT 1 FROM complaint_timeline_entries t WHERE t.complaint_id = c.id AND t.actor_role = 'SYSTEM_ADMIN'
);
UPDATE complaints SET resolved_by_role = 'SYSTEM_ADMIN' WHERE resolved_by IS NOT NULL;
UPDATE complaints SET status = 'SYSTEM_REVIEW'
WHERE escalated_at IS NOT NULL AND status NOT IN ('RESOLVED', 'REJECTED', 'CANCELLED', 'WAITING_FOR_CUSTOMER');
UPDATE complaints SET status = 'UNDER_REVIEW'
WHERE escalated_at IS NULL AND status IN ('WAITING_FOR_HOTEL', 'RESOLVING');
CREATE INDEX idx_complaints_escalated_updated ON complaints (updated_at DESC) WHERE escalated_at IS NOT NULL;
