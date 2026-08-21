ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS ck_notifications_type;

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
        'CHAT_MESSAGE',
        'CHECKIN_REMINDER',
        'CHECKIN_OVERDUE',
        'CHECKOUT_REMINDER',
        'CHECKOUT_OVERDUE',
        'BOOKING_NO_SHOW',
        'REFUND_REQUEST',
        'REFUND_STATUS',
        'SYSTEM'
    ));
