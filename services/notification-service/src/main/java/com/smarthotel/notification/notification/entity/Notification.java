package com.smarthotel.notification.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "notifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 30)
    private NotificationType type;

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

    public Notification(
            UUID userId,
            String email,
            String title,
            String content,
            NotificationType type
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.userId = userId;
        this.email = email;
        this.title = title;
        this.content = content;
        this.type = type;
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
}