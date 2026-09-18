CREATE TABLE hotel_policies (
    hotel_id UUID PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
    late_checkout_allowed BOOLEAN,
    late_checkout_details VARCHAR(1000),
    children_policy VARCHAR(2000),
    crib_available BOOLEAN,
    extra_bed_available BOOLEAN,
    pets_allowed BOOLEAN,
    smoking_allowed BOOLEAN,
    parties_allowed BOOLEAN,
    quiet_hours_from TIME,
    quiet_hours_to TIME,
    identity_document_required BOOLEAN,
    check_in_instructions VARCHAR(3000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE hotel_policy_additional_rules (
    id UUID PRIMARY KEY,
    hotel_id UUID NOT NULL REFERENCES hotel_policies(hotel_id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    content VARCHAR(1500) NOT NULL,
    sort_order INTEGER NOT NULL,
    CONSTRAINT ck_hotel_policy_rule_sort_order CHECK (sort_order >= 0)
);

CREATE INDEX idx_hotel_policy_rules_hotel_sort
    ON hotel_policy_additional_rules(hotel_id, sort_order);
