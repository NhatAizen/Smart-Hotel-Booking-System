package com.smarthotel.chat.message.dto;

import com.smarthotel.chat.message.entity.ChatMessage;
import com.smarthotel.chat.message.entity.ChatMessageType;
import com.smarthotel.chat.message.entity.ChatSenderType;

import java.time.Instant;
import java.util.UUID;

public record ChatMessageResponse(
        UUID id,
        UUID conversationId,
        ChatSenderType senderType,
        UUID senderId,
        ChatMessageType messageType,
        String content,
        String metadataJson,
        Instant createdAt,
        Instant readAt
) {
    public static ChatMessageResponse from(ChatMessage message) {
        return new ChatMessageResponse(
                message.getId(),
                message.getConversationId(),
                message.getSenderType(),
                message.getSenderId(),
                message.getMessageType(),
                message.getContent(),
                message.getMetadataJson(),
                message.getCreatedAt(),
                message.getReadAt()
        );
    }
}
