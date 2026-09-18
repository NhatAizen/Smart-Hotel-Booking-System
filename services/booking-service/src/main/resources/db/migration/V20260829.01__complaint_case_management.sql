CREATE TABLE complaints (
    id UUID PRIMARY KEY,
    complaint_code VARCHAR(40) NOT NULL UNIQUE,
    booking_id UUID NOT NULL,
    booking_code VARCHAR(40) NOT NULL,
    customer_id UUID NOT NULL,
    customer_name_snapshot VARCHAR(200) NOT NULL,
    hotel_id UUID NOT NULL,
    hotel_owner_id UUID NOT NULL,
    hotel_name_snapshot VARCHAR(255) NOT NULL,
    room_type_id UUID,
    room_type_name_snapshot VARCHAR(255),
    room_id UUID NOT NULL,
    room_number_snapshot VARCHAR(80),
    issue_type VARCHAR(50) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    disputed_amount NUMERIC(14, 2),
    status VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    resolution_type VARCHAR(60),
    resolution_note TEXT,
    refund_request_id UUID,
    violation_review_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_complaints_customer_created
    ON complaints (customer_id, created_at DESC);
CREATE INDEX idx_complaints_hotel_created
    ON complaints (hotel_id, created_at DESC);
CREATE INDEX idx_complaints_status_created
    ON complaints (status, created_at DESC);
CREATE INDEX idx_complaints_booking
    ON complaints (booking_id);
CREATE INDEX idx_complaints_refund
    ON complaints (refund_request_id)
    WHERE refund_request_id IS NOT NULL;

CREATE TABLE complaint_evidence (
    id UUID PRIMARY KEY,
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL,
    uploader_role VARCHAR(30) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL UNIQUE,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_complaint_evidence_case_created
    ON complaint_evidence (complaint_id, created_at ASC);

CREATE TABLE complaint_timeline_entries (
    id UUID PRIMARY KEY,
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_role VARCHAR(30) NOT NULL,
    message TEXT,
    from_status VARCHAR(40),
    to_status VARCHAR(40),
    visible_to_customer BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_complaint_timeline_case_created
    ON complaint_timeline_entries (complaint_id, created_at ASC);
