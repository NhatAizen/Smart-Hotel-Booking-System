package com.smarthotel.payment.refund.repository;

import com.smarthotel.payment.refund.entity.RefundRequest;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRequestRepository extends JpaRepository<RefundRequest, UUID> {
    @Query("select r.bookingId from RefundRequest r where r.id = :id")
    Optional<UUID> findBookingIdById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefundRequest r where r.id = :id")
    Optional<RefundRequest> findForUpdateById(@Param("id") UUID id);
    List<RefundRequest> findAllByCustomerIdOrderByRequestedAtDesc(UUID customerId);
    List<RefundRequest> findAllByHotelOwnerIdOrderByRequestedAtDesc(UUID hotelOwnerId);
    List<RefundRequest> findAllByStatusOrderByRequestedAtDesc(RefundRequestStatus status);
    List<RefundRequest> findAllByOrderByRequestedAtDesc();
    Optional<RefundRequest> findFirstByBookingIdOrderByRequestedAtDesc(UUID bookingId);
    Optional<RefundRequest> findFirstByBookingIdAndStatusInOrderByRequestedAtDesc(
            UUID bookingId,
            Collection<RefundRequestStatus> statuses
    );
    boolean existsByBookingIdAndStatusIn(
            UUID bookingId,
            Collection<RefundRequestStatus> statuses
    );
}
