CREATE TABLE notifications
(
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    email VARCHAR(255),

    title VARCHAR(200) NOT NULL,

    content TEXT NOT NULL,

    type VARCHAR(30) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    sent_at TIMESTAMP WITH TIME ZONE,

    read_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_notifications_type
        CHECK (
            type IN (
                'BOOKING_CREATED',
                'BOOKING_CONFIRMED',
                'PAYMENT_SUCCESS',
                'PAYMENT_FAILED',
                'BOOKING_CANCELLED',
                'SYSTEM'
            )
        ),

    CONSTRAINT ck_notifications_status
        CHECK (
            status IN (
                'CREATED',
                'SENT',
                'FAILED'
            )
        )
);

CREATE INDEX idx_notifications_user_id
    ON notifications (user_id);

CREATE INDEX idx_notifications_status
    ON notifications (status);

CREATE INDEX idx_notifications_is_read
    ON notifications (is_read);

CREATE INDEX idx_notifications_created_at
    ON notifications (created_at DESC);