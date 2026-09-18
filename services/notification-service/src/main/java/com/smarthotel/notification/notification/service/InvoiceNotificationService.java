package com.smarthotel.notification.notification.service;

import com.smarthotel.notification.common.exception.MailDeliveryException;
import com.smarthotel.notification.mail.MailService;
import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class InvoiceNotificationService {
    private final NotificationRepository repository;
    private final MailService mailService;

    public InvoiceNotificationService(NotificationRepository repository, MailService mailService) {
        this.repository = repository;
        this.mailService = mailService;
    }

    // A stable delivery ID prevents a retry after an HTTP timeout from sending the same invoice again.
    @Transactional(noRollbackFor = MailDeliveryException.class)
    public NotificationResponse deliver(UUID deliveryId, CreateNotificationRequest request) {
        if (request.userId() == null || request.email() == null || request.email().isBlank()) {
            throw new IllegalArgumentException("Thiếu người nhận email hóa đơn");
        }
        Notification notification = repository.findForInvoiceDelivery(deliveryId).orElseGet(() ->
                repository.saveAndFlush(new Notification(deliveryId, request.userId(), request.email().trim(),
                        request.title(), request.content(), request.type(), "INVOICE", request.actionUrl())));
        if (!request.userId().equals(notification.getUserId())
                || !request.email().trim().equalsIgnoreCase(notification.getEmail())
                || !"INVOICE".equals(notification.getCategory())) {
            throw new IllegalArgumentException("Mã gửi hóa đơn không khớp người nhận");
        }
        if (notification.getStatus() != NotificationStatus.SENT) {
            try {
                mailService.send(notification.getEmail(), notification.getTitle(), notification.getContent());
                notification.markSent();
            } catch (RuntimeException exception) {
                notification.markFailed();
                throw new MailDeliveryException(exception);
            }
        }
        return NotificationResponse.from(notification);
    }
}
