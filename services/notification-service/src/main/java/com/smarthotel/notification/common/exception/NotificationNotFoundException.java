package com.smarthotel.notification.common.exception;

import java.util.UUID;

public class NotificationNotFoundException extends RuntimeException {

    public NotificationNotFoundException(UUID notificationId) {
        super("Notification not found with ID: " + notificationId);
    }
}