package com.smarthotel.notification.notification.service;

import com.smarthotel.notification.common.exception.MailDeliveryException;
import com.smarthotel.notification.common.exception.NotificationNotFoundException;
import com.smarthotel.notification.mail.MailService;
import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationReadReceipt;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.repository.NotificationReadReceiptRepository;
import com.smarthotel.notification.notification.repository.NotificationRepository;
import com.smarthotel.notification.realtime.RealtimeEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationReadReceiptRepository receiptRepository;
    private final MailService mailService;
    private final RealtimeEventPublisher realtimeEventPublisher;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationReadReceiptRepository receiptRepository,
            MailService mailService,
            RealtimeEventPublisher realtimeEventPublisher
    ) {
        this.notificationRepository = notificationRepository;
        this.receiptRepository = receiptRepository;
        this.mailService = mailService;
        this.realtimeEventPublisher = realtimeEventPublisher;
    }

    @Transactional
    public NotificationResponse create(CreateNotificationRequest request) {
        String role = normalizeNullable(request.recipientRole());
        if (request.userId() == null && role == null) {
            throw new IllegalArgumentException("Cần userId hoặc recipientRole cho thông báo");
        }

        Notification notification = new Notification(
                request.userId(),
                role,
                normalizeNullable(request.email()),
                request.title().trim(),
                request.content().trim(),
                request.type(),
                normalizeNullable(request.category()),
                normalizeNullable(request.actionUrl())
        );
        notificationRepository.save(notification);
        if (request.sendEmail()) sendEmail(notification);
        NotificationResponse response = NotificationResponse.from(notification);
        afterCommit(() -> realtimeEventPublisher.notificationCreated(response));
        return response;
    }

    @Transactional(readOnly = true)
    public NotificationResponse getById(UUID notificationId, UUID viewerUserId, String viewerRole) {
        Notification notification = findNotification(notificationId);
        ensureCanView(notification, viewerUserId, viewerRole);
        return toViewerResponse(notification, viewerUserId);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getInbox(UUID userId, String role, boolean unreadOnly) {
        Map<UUID, Notification> unique = new LinkedHashMap<>();
        notificationRepository.findAllByUserIdOrderByCreatedAtDesc(userId)
                .forEach(item -> unique.put(item.getId(), item));

        String normalizedRole = normalizeRole(role);
        if (normalizedRole != null) {
            notificationRepository.findAllByRecipientRoleOrderByCreatedAtDesc(normalizedRole)
                    .forEach(item -> unique.put(item.getId(), item));
        }

        return unique.values().stream()
                .sorted(Comparator.comparing(Notification::getCreatedAt).reversed())
                .map(item -> toViewerResponse(item, userId))
                .filter(item -> !unreadOnly || !item.read())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getByStatus(NotificationStatus status) {
        return notificationRepository.findAllByStatusOrderByCreatedAtDesc(status)
                .stream().map(NotificationResponse::from).toList();
    }

    @Transactional
    public NotificationResponse markRead(UUID notificationId, UUID viewerUserId, String viewerRole) {
        Notification notification = findNotification(notificationId);
        ensureCanView(notification, viewerUserId, viewerRole);
        if (notification.getUserId() != null) {
            notification.markRead();
            return NotificationResponse.from(notification);
        }

        NotificationReadReceipt receipt = receiptRepository
                .findByNotificationIdAndUserId(notificationId, viewerUserId)
                .orElseGet(() -> receiptRepository.save(new NotificationReadReceipt(notificationId, viewerUserId)));
        return NotificationResponse.from(notification, true, receipt.getReadAt());
    }

    @Transactional
    public int markAllRead(UUID userId, String role) {
        List<NotificationResponse> inbox = getInbox(userId, role, true);
        for (NotificationResponse item : inbox) {
            markRead(item.id(), userId, role);
        }
        return inbox.size();
    }

    @Transactional
    public NotificationResponse resendEmail(UUID notificationId) {
        Notification notification = findNotification(notificationId);
        sendEmail(notification);
        return NotificationResponse.from(notification);
    }

    @Transactional
    public void delete(UUID notificationId) {
        notificationRepository.delete(findNotification(notificationId));
    }

    private NotificationResponse toViewerResponse(Notification notification, UUID viewerUserId) {
        if (notification.getUserId() != null) return NotificationResponse.from(notification);
        return receiptRepository.findByNotificationIdAndUserId(notification.getId(), viewerUserId)
                .map(receipt -> NotificationResponse.from(notification, true, receipt.getReadAt()))
                .orElseGet(() -> NotificationResponse.from(notification, false, null));
    }

    private void ensureCanView(Notification notification, UUID viewerUserId, String viewerRole) {
        if ("SYSTEM_ADMIN".equals(normalizeRole(viewerRole))) return;
        if (notification.getUserId() != null) {
            if (notification.getUserId().equals(viewerUserId)) return;
            throw new AccessDeniedException("Bạn không phải người nhận thông báo này");
        }

        String recipientRole = normalizeNullable(notification.getRecipientRole());
        String normalizedViewerRole = normalizeRole(viewerRole);
        if (recipientRole != null && recipientRole.equalsIgnoreCase(normalizedViewerRole)) return;
        throw new AccessDeniedException("Thông báo không dành cho vai trò hiện tại");
    }

    private void sendEmail(Notification notification) {
        if (notification.getEmail() == null) {
            throw new IllegalArgumentException("Notification email is missing");
        }
        try {
            mailService.send(notification.getEmail(), notification.getTitle(), notification.getContent());
            notification.markSent();
        } catch (Exception exception) {
            notification.markFailed();
            throw new MailDeliveryException(exception);
        }
    }

    private Notification findNotification(UUID notificationId) {
        return notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NotificationNotFoundException(notificationId));
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            action.run();
                        }
                    }
            );
            return;
        }
        action.run();
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private String normalizeRole(String value) {
        String normalized = normalizeNullable(value);
        if (normalized == null) return null;
        return normalized.replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
