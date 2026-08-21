CREATE TABLE chat_conversations
(
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL,
    booking_code VARCHAR(40),
    hotel_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    hotel_admin_id UUID NOT NULL,
    hotel_name VARCHAR(150) NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    check_in_time TIME NOT NULL,
    check_out_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    human_takeover BOOLEAN NOT NULL DEFAULT FALSE,
    arrival_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    expected_arrival_time TIME,
    last_message_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_chat_conversation_booking UNIQUE (booking_id),

    CONSTRAINT ck_chat_conversation_status
        CHECK (status IN ('OPEN', 'CLOSED')),

    CONSTRAINT ck_chat_arrival_status
        CHECK (arrival_status IN (
            'UNKNOWN',
            'CONFIRMED',
            'ARRIVING_LATE',
            'NEEDS_HELP',
            'NO_SHOW_RISK'
        ))
);

CREATE INDEX idx_chat_conversations_customer
    ON chat_conversations (customer_id, last_message_at DESC);

CREATE INDEX idx_chat_conversations_hotel_admin
    ON chat_conversations (hotel_admin_id, last_message_at DESC);

CREATE INDEX idx_chat_conversations_hotel
    ON chat_conversations (hotel_id, last_message_at DESC);


CREATE TABLE chat_messages
(
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(30) NOT NULL,
    sender_id UUID,
    message_type VARCHAR(30) NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ,

    CONSTRAINT ck_chat_message_sender_type
        CHECK (sender_type IN (
            'CUSTOMER',
            'HOTEL_ADMIN',
            'HOTEL_BOT',
            'SYSTEM'
        )),

    CONSTRAINT ck_chat_message_type
        CHECK (message_type IN (
            'TEXT',
            'REMINDER',
            'ACTION',
            'SYSTEM'
        ))
);

CREATE INDEX idx_chat_messages_conversation_created
    ON chat_messages (conversation_id, created_at ASC);

CREATE INDEX idx_chat_messages_unread
    ON chat_messages (conversation_id, read_at)
    WHERE read_at IS NULL;


CREATE TABLE scheduled_chat_reminders
(
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL,
    type VARCHAR(40) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    dedupe_key VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,

    CONSTRAINT uq_scheduled_chat_reminder_dedupe UNIQUE (dedupe_key),

    CONSTRAINT ck_scheduled_chat_reminder_type
        CHECK (type IN (
            'CHECKIN_24H',
            'CHECKIN_2H',
            'CHECKIN_OVERDUE',
            'CHECKOUT_PREVIOUS_EVENING',
            'CHECKOUT_2H',
            'CHECKOUT_OVERDUE'
        )),

    CONSTRAINT ck_scheduled_chat_reminder_status
        CHECK (status IN ('PENDING', 'SENT', 'CANCELLED'))
);

CREATE INDEX idx_scheduled_chat_reminders_due
    ON scheduled_chat_reminders (status, scheduled_at);
