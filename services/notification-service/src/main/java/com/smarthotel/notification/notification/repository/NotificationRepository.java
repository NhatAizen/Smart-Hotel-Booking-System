package com.smarthotel.notification.notification.repository;

import com.smarthotel.notification.notification.entity.Notification;
import com.smarthotel.notification.notification.entity.NotificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT n FROM Notification n WHERE n.id = :id")
    Optional<Notification> findForInvoiceDelivery(@Param("id") UUID id);
    List<Notification> findAllByUserIdOrderByCreatedAtDesc(UUID userId);
    List<Notification> findAllByRecipientRoleOrderByCreatedAtDesc(String recipientRole);
    List<Notification> findAllByStatusOrderByCreatedAtDesc(NotificationStatus status);
}
