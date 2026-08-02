package com.smarthotel.notification.notification.repository;

import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository
        extends JpaRepository<Notification, UUID> {

    List<Notification> findAllByUserIdOrderByCreatedAtDesc(
            UUID userId
    );

    List<Notification> findAllByUserIdAndReadFalseOrderByCreatedAtDesc(
            UUID userId
    );

    List<Notification> findAllByStatusOrderByCreatedAtDesc(
            NotificationStatus status
    );
}