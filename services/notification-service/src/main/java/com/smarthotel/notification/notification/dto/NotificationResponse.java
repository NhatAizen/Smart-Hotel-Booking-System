package com.smarthotel.notification.notification.dto;

import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.entity.NotificationType;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(
        UUID id,
        UUID userId,
        String recipientRole,
        String email,
        String title,
        String content,
        NotificationType type,
        String category,
        String actionUrl,
        NotificationStatus status,
        boolean read,
        Instant sentAt,
        Instant readAt,
        Instant createdAt,
        Instant updatedAt
) {
    public static NotificationResponse from(Notification notification) {
        return from(notification, notification.isRead(), notification.getReadAt());
    }

    public static NotificationResponse from(Notification notification, boolean read, Instant readAt) {
        return new NotificationResponse(
                notification.getId(),
                notification.getUserId(),
                notification.getRecipientRole(),
                notification.getEmail(),
                notification.getTitle(),
                notification.getContent(),
                notification.getType(),
                notification.getCategory(),
                notification.getActionUrl(),
                notification.getStatus(),
                read,
                notification.getSentAt(),
                readAt,
                notification.getCreatedAt(),
                notification.getUpdatedAt()
        );
    }
}
