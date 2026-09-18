package com.smarthotel.notification.notification.service;

import com.smarthotel.notification.common.exception.MailDeliveryException;
import com.smarthotel.notification.mail.MailService;
import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import com.smarthotel.notification.notification.entity.NotificationType;
import com.smarthotel.notification.notification.repository.NotificationRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class InvoiceNotificationServiceTest {
    private final NotificationRepository repository = mock(NotificationRepository.class);
    private final MailService mail = mock(MailService.class);
    private final InvoiceNotificationService service = new InvoiceNotificationService(repository, mail);
    private final UUID deliveryId = UUID.randomUUID();
    private final UUID customerId = UUID.randomUUID();
    private final CreateNotificationRequest request = new CreateNotificationRequest(customerId, null,
            "invoice@example.com", "Hóa đơn ALH-02", "Nội dung hóa đơn", NotificationType.SYSTEM,
            "INVOICE", "/customer/bookings", true);

    @Test
    void newInvoiceIsSentAndStoredWithStableId() {
        when(repository.findForInvoiceDelivery(deliveryId)).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        var result = service.deliver(deliveryId, request);
        assertThat(result.id()).isEqualTo(deliveryId);
        assertThat(result.status()).isEqualTo(NotificationStatus.SENT);
        verify(mail).send(request.email(), request.title(), request.content());
    }

    @Test
    void alreadySentInvoiceIsNotSentAgain() {
        Notification existing = existingInvoice();
        existing.markSent();
        when(repository.findForInvoiceDelivery(deliveryId)).thenReturn(Optional.of(existing));
        assertThat(service.deliver(deliveryId, request).status()).isEqualTo(NotificationStatus.SENT);
        verifyNoInteractions(mail);
    }

    @Test
    void smtpFailureRemainsRetryableAndNextAttemptSucceeds() {
        Notification existing = existingInvoice();
        when(repository.findForInvoiceDelivery(deliveryId)).thenReturn(Optional.of(existing));
        doThrow(new org.springframework.mail.MailSendException("Unavailable")).doNothing()
                .when(mail).send(request.email(), request.title(), request.content());
        assertThatThrownBy(() -> service.deliver(deliveryId, request)).isInstanceOf(MailDeliveryException.class);
        assertThat(existing.getStatus()).isEqualTo(NotificationStatus.FAILED);
        assertThat(service.deliver(deliveryId, request).status()).isEqualTo(NotificationStatus.SENT);
    }

    @Test
    void deliveryIdCannotBeReusedForAnotherRecipient() {
        Notification existing = new Notification(deliveryId, UUID.randomUUID(), "someone@example.com",
                request.title(), request.content(), NotificationType.SYSTEM, "INVOICE", request.actionUrl());
        when(repository.findForInvoiceDelivery(deliveryId)).thenReturn(Optional.of(existing));
        assertThatThrownBy(() -> service.deliver(deliveryId, request)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(mail);
    }

    private Notification existingInvoice() {
        return new Notification(deliveryId, customerId, request.email(), request.title(), request.content(),
                NotificationType.SYSTEM, "INVOICE", request.actionUrl());
    }
}
