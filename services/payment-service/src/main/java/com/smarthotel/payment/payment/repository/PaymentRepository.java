package com.smarthotel.payment.payment.repository;

import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.entity.PaymentType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    List<Payment> findAllByBookingIdOrderByCreatedAtDesc(UUID bookingId);

    List<Payment> findAllByCustomerIdOrderByCreatedAtDesc(UUID customerId);

    List<Payment> findAllByStatusOrderByCreatedAtDesc(PaymentStatus status);

    List<Payment> findAllByPaymentOrderIdOrderByCreatedAtAsc(UUID paymentOrderId);

    List<Payment> findAllByHotelOwnerIdOrderByCreatedAtDesc(UUID hotelOwnerId);

    Optional<Payment> findFirstByBookingIdAndStatusInAndPaymentTypeOrderByCreatedAtDesc(
            UUID bookingId,
            Collection<PaymentStatus> statuses,
            PaymentType paymentType
    );

    boolean existsByTransactionCode(String transactionCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.id = :id")
    Optional<Payment> findForUpdateById(@Param("id") UUID id);

    List<Payment> findAllByStatusAndWalletAppliedTrueAndRevenueReleasedFalseOrderByPaidAtAsc(
            PaymentStatus status
    );
}
