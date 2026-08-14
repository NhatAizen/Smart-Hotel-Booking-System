package com.smarthotel.notification.notification.controller;

import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping("/notifications")
    public ResponseEntity<NotificationResponse> create(@Valid @RequestBody CreateNotificationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(notificationService.create(request));
    }

    @GetMapping("/notifications/{notificationId}")
    public ResponseEntity<NotificationResponse> getById(
            @PathVariable UUID notificationId,
            @RequestParam UUID userId
    ) {
        return ResponseEntity.ok(notificationService.getById(notificationId, userId));
    }

    @GetMapping("/users/{userId}/notifications")
    public ResponseEntity<List<NotificationResponse>> getByUser(
            @PathVariable UUID userId,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "false") boolean unreadOnly
    ) {
        return ResponseEntity.ok(notificationService.getInbox(userId, role, unreadOnly));
    }

    @PatchMapping("/users/{userId}/notifications/read-all")
    public ResponseEntity<Map<String, Integer>> markAllRead(
            @PathVariable UUID userId,
            @RequestParam(required = false) String role
    ) {
        return ResponseEntity.ok(Map.of("updated", notificationService.markAllRead(userId, role)));
    }

    @GetMapping("/notifications")
    public ResponseEntity<List<NotificationResponse>> getByStatus(@RequestParam NotificationStatus status) {
        return ResponseEntity.ok(notificationService.getByStatus(status));
    }

    @PatchMapping("/notifications/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markRead(
            @PathVariable UUID notificationId,
            @RequestParam UUID userId
    ) {
        return ResponseEntity.ok(notificationService.markRead(notificationId, userId));
    }

    @PostMapping("/notifications/{notificationId}/resend-email")
    public ResponseEntity<NotificationResponse> resendEmail(@PathVariable UUID notificationId) {
        return ResponseEntity.ok(notificationService.resendEmail(notificationId));
    }

    @DeleteMapping("/notifications/{notificationId}")
    public ResponseEntity<Void> delete(@PathVariable UUID notificationId) {
        notificationService.delete(notificationId);
        return ResponseEntity.noContent().build();
    }
}
