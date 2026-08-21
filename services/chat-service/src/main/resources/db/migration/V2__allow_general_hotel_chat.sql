ALTER TABLE chat_conversations
    ALTER COLUMN booking_id DROP NOT NULL,
    ALTER COLUMN check_in DROP NOT NULL,
    ALTER COLUMN check_out DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_general_customer_hotel
    ON chat_conversations (customer_id, hotel_id)
    WHERE booking_id IS NULL AND status = 'OPEN';
