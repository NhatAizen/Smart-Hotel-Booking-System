package com.smarthotel.notification.notification.controller;

import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(
        name = "Notifications",
        description = "Manage in-app notifications and email delivery"
)
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(
            NotificationService notificationService
    ) {
        this.notificationService = notificationService;
    }

    @Operation(summary = "Create notification")
    @PostMapping("/notifications")
    public ResponseEntity<NotificationResponse> create(
            @Valid @RequestBody CreateNotificationRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(notificationService.create(request));
    }

    @Operation(summary = "Get notification details")
    @GetMapping("/notifications/{notificationId}")
    public ResponseEntity<NotificationResponse> getById(
            @PathVariable UUID notificationId
    ) {
        return ResponseEntity.ok(
                notificationService.getById(notificationId)
        );
    }

    @Operation(summary = "List notifications by user")
    @GetMapping("/users/{userId}/notifications")
    public ResponseEntity<List<NotificationResponse>> getByUser(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "false") boolean unreadOnly
    ) {
        return ResponseEntity.ok(
                notificationService.getByUser(
                        userId,
                        unreadOnly
                )
        );
    }

    @Operation(summary = "Filter notifications by status")
    @GetMapping("/notifications")
    public ResponseEntity<List<NotificationResponse>> getByStatus(
            @RequestParam NotificationStatus status
    ) {
        return ResponseEntity.ok(
                notificationService.getByStatus(status)
        );
    }

    @Operation(summary = "Mark notification as read")
    @PatchMapping("/notifications/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markRead(
            @PathVariable UUID notificationId
    ) {
        return ResponseEntity.ok(
                notificationService.markRead(notificationId)
        );
    }

    @Operation(summary = "Resend notification email")
    @PostMapping("/notifications/{notificationId}/resend-email")
    public ResponseEntity<NotificationResponse> resendEmail(
            @PathVariable UUID notificationId
    ) {
        return ResponseEntity.ok(
                notificationService.resendEmail(notificationId)
        );
    }

    @Operation(summary = "Delete notification")
    @DeleteMapping("/notifications/{notificationId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID notificationId
    ) {
        notificationService.delete(notificationId);
        return ResponseEntity.noContent().build();
    }
}