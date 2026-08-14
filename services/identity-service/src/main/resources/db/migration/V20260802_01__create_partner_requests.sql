CREATE TABLE partner_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,

    applicant_type VARCHAR(30) NOT NULL,
    legal_name VARCHAR(150) NOT NULL,
    identity_number VARCHAR(50) NOT NULL,
    business_phone VARCHAR(30) NOT NULL,
    business_address VARCHAR(255) NOT NULL,
    document_url VARCHAR(1000) NOT NULL,
    note VARCHAR(1000),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    rejection_reason VARCHAR(500),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_partner_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_partner_requests_applicant_type
        CHECK (
            applicant_type IN (
                'INDIVIDUAL',
                'BUSINESS'
            )
        ),

    CONSTRAINT ck_partner_requests_status
        CHECK (
            status IN (
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        )
);

CREATE INDEX idx_partner_requests_status
    ON partner_requests(status);

CREATE INDEX idx_partner_requests_created_at
    ON partner_requests(created_at);