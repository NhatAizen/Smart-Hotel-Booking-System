package com.smarthotel.notification.notification.dto;

import com.smarthotel.notification.notification.entity.NotificationType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateNotificationRequest(

        @NotNull(message = "User ID is required")
        UUID userId,

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

        boolean sendEmail

) {
}