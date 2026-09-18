package com.smarthotel.notification.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "recipient_role", length = 40)
    private String recipientRole;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 40)
    private NotificationType type;

    @Column(name = "category", length = 40)
    private String category;

    @Column(name = "action_url", length = 500)
    private String actionUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private NotificationStatus status;

    @Column(name = "is_read", nullable = false)
    private boolean read;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;


    protected Notification() {
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getRecipientRole() { return recipientRole; }
    public String getEmail() { return email; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public NotificationType getType() { return type; }
    public String getCategory() { return category; }
    public String getActionUrl() { return actionUrl; }
    public NotificationStatus getStatus() { return status; }
    public boolean isRead() { return read; }
    public Instant getSentAt() { return sentAt; }
    public Instant getReadAt() { return readAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public Notification(
            UUID userId,
            String recipientRole,
            String email,
            String title,
            String content,
            NotificationType type,
            String category,
            String actionUrl
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.recipientRole = normalizeRole(recipientRole);
        this.email = email;
        this.title = title;
        this.content = content;
        this.type = type;
        this.category = category;
        this.actionUrl = actionUrl;
        this.status = NotificationStatus.CREATED;
        this.read = false;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markSent() {
        this.status = NotificationStatus.SENT;
        this.sentAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public Notification(UUID deliveryId, UUID userId, String email, String title, String content,
                        NotificationType type, String category, String actionUrl) {
        this(userId, (String) null, email, title, content, type, category, actionUrl);
        this.id = deliveryId;
    }

    public void markFailed() {
        this.status = NotificationStatus.FAILED;
        this.updatedAt = Instant.now();
    }

    public void markRead() {
        if (!this.read) {
            this.read = true;
            this.readAt = Instant.now();
            this.updatedAt = Instant.now();
        }
    }

    private static String normalizeRole(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim().toUpperCase();
    }
}
