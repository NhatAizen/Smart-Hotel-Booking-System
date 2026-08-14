package com.smarthotel.notification.notification.repository;

import com.smarthotel.notification.notification.entity.NotificationReadReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface NotificationReadReceiptRepository extends JpaRepository<NotificationReadReceipt, UUID> {
    Optional<NotificationReadReceipt> findByNotificationIdAndUserId(UUID notificationId, UUID userId);
    boolean existsByNotificationIdAndUserId(UUID notificationId, UUID userId);
}
