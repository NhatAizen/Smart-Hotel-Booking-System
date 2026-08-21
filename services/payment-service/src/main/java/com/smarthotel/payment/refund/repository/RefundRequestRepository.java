package com.smarthotel.payment.refund.repository;

import com.smarthotel.payment.refund.entity.RefundRequest;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRequestRepository extends JpaRepository<RefundRequest, UUID> {
    List<RefundRequest> findAllByCustomerIdOrderByRequestedAtDesc(UUID customerId);
    List<RefundRequest> findAllByHotelOwnerIdOrderByRequestedAtDesc(UUID hotelOwnerId);
    List<RefundRequest> findAllByStatusOrderByRequestedAtDesc(RefundRequestStatus status);
    List<RefundRequest> findAllByOrderByRequestedAtDesc();
    Optional<RefundRequest> findFirstByBookingIdOrderByRequestedAtDesc(UUID bookingId);
    Optional<RefundRequest> findFirstByBookingIdAndStatusInOrderByRequestedAtDesc(
            UUID bookingId,
            Collection<RefundRequestStatus> statuses
    );
}
