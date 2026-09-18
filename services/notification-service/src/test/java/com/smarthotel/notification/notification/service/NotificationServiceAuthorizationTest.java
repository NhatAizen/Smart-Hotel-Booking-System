package com.smarthotel.notification.notification.service;

import com.smarthotel.notification.mail.MailService;
import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationType;
import com.smarthotel.notification.notification.repository.NotificationReadReceiptRepository;
import com.smarthotel.notification.notification.repository.NotificationRepository;
import com.smarthotel.notification.realtime.RealtimeEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceAuthorizationTest {
    @Mock NotificationRepository notificationRepository;
    @Mock NotificationReadReceiptRepository receiptRepository;
    @Mock MailService mailService;
    @Mock RealtimeEventPublisher realtimeEventPublisher;

    private NotificationService service;

    @BeforeEach
    void setUp() {
        service = new NotificationService(
                notificationRepository,
                receiptRepository,
                mailService,
                realtimeEventPublisher
        );
    }

    @Test
    void directNotificationCanOnlyBeReadByOwnerOrSystemAdmin() {
        UUID ownerId = UUID.randomUUID();
        Notification notification = notification(ownerId, null);
        when(notificationRepository.findById(notification.getId())).thenReturn(Optional.of(notification));

        assertDoesNotThrow(() -> service.getById(notification.getId(), ownerId, "CUSTOMER"));
        assertDoesNotThrow(() -> service.getById(
                notification.getId(), UUID.randomUUID(), "SYSTEM_ADMIN"));
        assertThrows(AccessDeniedException.class, () -> service.getById(
                notification.getId(), UUID.randomUUID(), "CUSTOMER"));
    }

    @Test
    void roleNotificationRequiresMatchingRole() {
        UUID viewerId = UUID.randomUUID();
        Notification notification = notification(null, "HOTEL_ADMIN");
        when(notificationRepository.findById(notification.getId())).thenReturn(Optional.of(notification));
        when(receiptRepository.findByNotificationIdAndUserId(notification.getId(), viewerId))
                .thenReturn(Optional.empty());

        assertDoesNotThrow(() -> service.getById(
                notification.getId(), viewerId, "ROLE_HOTEL_ADMIN"));
        assertThrows(AccessDeniedException.class, () -> service.getById(
                notification.getId(), viewerId, "CUSTOMER"));
    }

    private Notification notification(UUID userId, String role) {
        return new Notification(
                userId,
                role,
                null,
                "Test",
                "Test notification",
                NotificationType.SYSTEM,
                "SYSTEM",
                null
        );
    }
}
