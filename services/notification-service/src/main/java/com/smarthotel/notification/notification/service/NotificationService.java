package com.smarthotel.notification.notification.service;

import com.smarthotel.notification.common.exception.MailDeliveryException;
import com.smarthotel.notification.common.exception.NotificationNotFoundException;
import com.smarthotel.notification.mail.MailService;
import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final MailService mailService;

    public NotificationService(
            NotificationRepository notificationRepository,
            MailService mailService
    ) {
        this.notificationRepository = notificationRepository;
        this.mailService = mailService;
    }

    @Transactional
    public NotificationResponse create(
            CreateNotificationRequest request
    ) {
        Notification notification = new Notification(
                request.userId(),
                normalizeNullable(request.email()),
                request.title().trim(),
                request.content().trim(),
                request.type()
        );

        notificationRepository.save(notification);

        if (request.sendEmail()) {
            sendEmail(notification);
        }

        return NotificationResponse.from(notification);
    }

    @Transactional(readOnly = true)
    public NotificationResponse getById(
            UUID notificationId
    ) {
        return NotificationResponse.from(
                findNotification(notificationId)
        );
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getByUser(
            UUID userId,
            boolean unreadOnly
    ) {
        List<Notification> notifications =
                unreadOnly
                        ? notificationRepository
                                .findAllByUserIdAndReadFalseOrderByCreatedAtDesc(
                                        userId
                                )
                        : notificationRepository
                                .findAllByUserIdOrderByCreatedAtDesc(userId);

        return notifications.stream()
                .map(NotificationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getByStatus(
            NotificationStatus status
    ) {
        return notificationRepository
                .findAllByStatusOrderByCreatedAtDesc(status)
                .stream()
                .map(NotificationResponse::from)
                .toList();
    }

    @Transactional
    public NotificationResponse markRead(
            UUID notificationId
    ) {
        Notification notification =
                findNotification(notificationId);

        notification.markRead();

        return NotificationResponse.from(notification);
    }

    @Transactional
    public NotificationResponse resendEmail(
            UUID notificationId
    ) {
        Notification notification =
                findNotification(notificationId);

        sendEmail(notification);

        return NotificationResponse.from(notification);
    }

    @Transactional
    public void delete(UUID notificationId) {
        Notification notification =
                findNotification(notificationId);

        notificationRepository.delete(notification);
    }

    private void sendEmail(Notification notification) {
        if (notification.getEmail() == null) {
            throw new IllegalArgumentException(
                    "Notification email is missing"
            );
        }

        try {
            mailService.send(
                    notification.getEmail(),
                    notification.getTitle(),
                    notification.getContent()
            );

            notification.markSent();
        } catch (Exception exception) {
            notification.markFailed();
            throw new MailDeliveryException(exception);
        }
    }

    private Notification findNotification(
            UUID notificationId
    ) {
        return notificationRepository
                .findById(notificationId)
                .orElseThrow(
                        () -> new NotificationNotFoundException(
                                notificationId
                        )
                );
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}