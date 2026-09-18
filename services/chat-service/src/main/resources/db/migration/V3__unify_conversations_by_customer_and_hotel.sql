-- A conversation represents one customer talking to one hotel. Older versions
-- created a separate row per booking, so merge those rows without losing their
-- messages or booking-specific reminder plans.
CREATE TEMP TABLE chat_conversation_merge_map ON COMMIT DROP AS
SELECT
    id AS source_id,
    FIRST_VALUE(id) OVER (
        PARTITION BY customer_id, hotel_id
        ORDER BY last_message_at DESC, updated_at DESC, created_at DESC, id
    ) AS target_id
FROM chat_conversations;

UPDATE chat_messages AS message
SET conversation_id = map.target_id
FROM chat_conversation_merge_map AS map
WHERE message.conversation_id = map.source_id
  AND map.source_id <> map.target_id;

UPDATE scheduled_chat_reminders AS reminder
SET conversation_id = map.target_id
FROM chat_conversation_merge_map AS map
WHERE reminder.conversation_id = map.source_id
  AND map.source_id <> map.target_id;

WITH conversation_rollup AS (
    SELECT
        map.target_id,
        MIN(conversation.created_at) AS first_created_at,
        MAX(conversation.last_message_at) AS latest_message_at,
        BOOL_OR(conversation.human_takeover) AS has_human_takeover
    FROM chat_conversation_merge_map AS map
    JOIN chat_conversations AS conversation ON conversation.id = map.source_id
    GROUP BY map.target_id
)
UPDATE chat_conversations AS conversation
SET created_at = rollup.first_created_at,
    last_message_at = rollup.latest_message_at,
    human_takeover = rollup.has_human_takeover,
    updated_at = GREATEST(conversation.updated_at, rollup.latest_message_at)
FROM conversation_rollup AS rollup
WHERE conversation.id = rollup.target_id;

DELETE FROM chat_conversations AS conversation
USING chat_conversation_merge_map AS map
WHERE conversation.id = map.source_id
  AND map.source_id <> map.target_id;

ALTER TABLE chat_conversations
    DROP CONSTRAINT IF EXISTS uq_chat_conversation_booking;

DROP INDEX IF EXISTS uq_chat_general_customer_hotel;

CREATE UNIQUE INDEX uq_chat_conversation_customer_hotel
    ON chat_conversations (customer_id, hotel_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_booking
    ON chat_conversations (booking_id)
    WHERE booking_id IS NOT NULL;
