package com.smarthotel.chat.message.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    protected ChatMessage() {
    }

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false, length = 30)
    private ChatSenderType senderType;

    @Column(name = "sender_id")
    private UUID senderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 30)
    private ChatMessageType messageType;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "metadata_json", columnDefinition = "TEXT")
    private String metadataJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    public ChatMessage(
            UUID conversationId,
            ChatSenderType senderType,
            UUID senderId,
            ChatMessageType messageType,
            String content,
            String metadataJson
    ) {
        this.id = UUID.randomUUID();
        this.conversationId = conversationId;
        this.senderType = senderType;
        this.senderId = senderId;
        this.messageType = messageType == null ? ChatMessageType.TEXT : messageType;
        this.content = content == null ? "" : content.trim();
        this.metadataJson = metadataJson;
        this.createdAt = Instant.now();
        this.readAt = null;
    }

    public void markRead() {
        if (this.readAt == null) {
            this.readAt = Instant.now();
        }
    }

    public UUID getId() { return id; }
    public UUID getConversationId() { return conversationId; }
    public ChatSenderType getSenderType() { return senderType; }
    public UUID getSenderId() { return senderId; }
    public ChatMessageType getMessageType() { return messageType; }
    public String getContent() { return content; }
    public String getMetadataJson() { return metadataJson; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReadAt() { return readAt; }
}
