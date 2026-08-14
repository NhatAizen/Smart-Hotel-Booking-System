ALTER TABLE notifications
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(40),
    ADD COLUMN IF NOT EXISTS category VARCHAR(40),
    ADD COLUMN IF NOT EXISTS action_url VARCHAR(500);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS ck_notifications_type;

ALTER TABLE notifications
    ADD CONSTRAINT ck_notifications_type
    CHECK (type IN (
        'BOOKING_CREATED',
        'BOOKING_CONFIRMED',
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'BOOKING_CANCELLED',
        'BOOKING_CHECKED_IN',
        'BOOKING_CHECKED_OUT',
        'ROOM_CLEANING',
        'ROOM_READY',
        'REVIEW_CREATED',
        'PARTNER_REQUEST',
        'HOTEL_SUBMITTED',
        'WITHDRAWAL_REQUEST',
        'WITHDRAWAL_STATUS',
        'SYSTEM'
    ));

ALTER TABLE notifications
    ADD CONSTRAINT ck_notifications_recipient
    CHECK (user_id IS NOT NULL OR recipient_role IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
    ON notifications (recipient_role);

CREATE INDEX IF NOT EXISTS idx_notifications_category
    ON notifications (category);

CREATE TABLE IF NOT EXISTS notification_read_receipts
(
    id UUID PRIMARY KEY,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notification_read_receipt UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_receipts_user
    ON notification_read_receipts (user_id, read_at DESC);
