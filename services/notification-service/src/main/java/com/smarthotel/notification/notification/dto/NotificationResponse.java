package com.smarthotel.notification.notification.dto;

import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.entity.NotificationType;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(
        UUID id,
        UUID userId,
        String email,
        String title,
        String content,
        NotificationType type,
        NotificationStatus status,
        boolean read,
        Instant sentAt,
        Instant readAt,
        Instant createdAt,
        Instant updatedAt
) {

    public static NotificationResponse from(
            Notification notification
    ) {
        return new NotificationResponse(
                notification.getId(),
                notification.getUserId(),
                notification.getEmail(),
                notification.getTitle(),
                notification.getContent(),
                notification.getType(),
                notification.getStatus(),
                notification.isRead(),
                notification.getSentAt(),
                notification.getReadAt(),
                notification.getCreatedAt(),
                notification.getUpdatedAt()
        );
    }
}