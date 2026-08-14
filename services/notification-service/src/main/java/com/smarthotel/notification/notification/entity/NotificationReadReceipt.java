package com.smarthotel.notification.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_read_receipts")
public class NotificationReadReceipt {
    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "notification_id", nullable = false)
    private UUID notificationId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "read_at", nullable = false)
    private Instant readAt;


    protected NotificationReadReceipt() {
    }

    public UUID getId() { return id; }
    public UUID getNotificationId() { return notificationId; }
    public UUID getUserId() { return userId; }
    public Instant getReadAt() { return readAt; }

    public NotificationReadReceipt(UUID notificationId, UUID userId) {
        this.id = UUID.randomUUID();
        this.notificationId = notificationId;
        this.userId = userId;
        this.readAt = Instant.now();
    }
}
