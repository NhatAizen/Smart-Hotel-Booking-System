package com.smarthotel.notification.notification.controller;

import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.service.NotificationService;
import com.smarthotel.notification.security.InternalApiKeyVerifier;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class NotificationController {

    private final NotificationService notificationService;
    private final InternalApiKeyVerifier internalApiKeyVerifier;

    public NotificationController(
            NotificationService notificationService,
            InternalApiKeyVerifier internalApiKeyVerifier
    ) {
        this.notificationService = notificationService;
        this.internalApiKeyVerifier = internalApiKeyVerifier;
    }

    @PostMapping("/notifications")
    public ResponseEntity<NotificationResponse> create(
            @RequestHeader(value = "X-Internal-Api-Key", required = false) String internalApiKey,
            @Valid @RequestBody CreateNotificationRequest request
    ) {
        internalApiKeyVerifier.verify(internalApiKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(notificationService.create(request));
    }

    @GetMapping("/notifications/{notificationId}")
    public ResponseEntity<NotificationResponse> getById(
            @PathVariable UUID notificationId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(notificationService.getById(
                notificationId, currentUserId(jwt), currentRole(jwt)));
    }

    @GetMapping("/users/{userId}/notifications")
    public ResponseEntity<List<NotificationResponse>> getByUser(
            @PathVariable UUID userId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "false") boolean unreadOnly
    ) {
        ensureSelf(jwt, userId);
        return ResponseEntity.ok(notificationService.getInbox(userId, currentRole(jwt), unreadOnly));
    }

    @PatchMapping("/users/{userId}/notifications/read-all")
    public ResponseEntity<Map<String, Integer>> markAllRead(
            @PathVariable UUID userId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        ensureSelf(jwt, userId);
        return ResponseEntity.ok(Map.of(
                "updated", notificationService.markAllRead(userId, currentRole(jwt))));
    }

    @GetMapping("/notifications")
    public ResponseEntity<List<NotificationResponse>> getByStatus(@RequestParam NotificationStatus status) {
        return ResponseEntity.ok(notificationService.getByStatus(status));
    }

    @PatchMapping("/notifications/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markRead(
            @PathVariable UUID notificationId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(notificationService.markRead(
                notificationId, currentUserId(jwt), currentRole(jwt)));
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

    private void ensureSelf(Jwt jwt, UUID requestedUserId) {
        if (!currentUserId(jwt).equals(requestedUserId)) {
            throw new AccessDeniedException("Không được truy cập thông báo của người dùng khác");
        }
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException("Không xác định được người dùng hiện tại");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException exception) {
            throw new AccessDeniedException("Subject trong access token không hợp lệ", exception);
        }
    }

    private String currentRole(Jwt jwt) {
        String role = jwt == null ? null : jwt.getClaimAsString("role");
        if (role == null || role.isBlank()) {
            throw new AccessDeniedException("Không xác định được vai trò hiện tại");
        }
        return role.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
