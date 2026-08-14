package com.smarthotel.notification.notification.dto;

import com.smarthotel.notification.notification.entity.NotificationType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateNotificationRequest(
        UUID userId,
        @Size(max = 40, message = "Recipient role must not exceed 40 characters")
        String recipientRole,
        @Email(message = "Email format is invalid")
        @Size(max = 255, message = "Email must not exceed 255 characters")
        String email,
        @NotBlank(message = "Title is required")
        @Size(max = 200, message = "Title must not exceed 200 characters")
        String title,
        @NotBlank(message = "Content is required")
        String content,
        @NotNull(message = "Notification type is required")
        NotificationType type,
        @Size(max = 40, message = "Category must not exceed 40 characters")
        String category,
        @Size(max = 500, message = "Action URL must not exceed 500 characters")
        String actionUrl,
        boolean sendEmail
) {
}
