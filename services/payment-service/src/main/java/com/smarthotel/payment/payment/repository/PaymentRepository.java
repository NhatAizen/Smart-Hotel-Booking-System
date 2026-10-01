package com.smarthotel.payment.payment.repository;

import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
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
import java.math.BigDecimal;
import java.time.Instant;

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

    // Scalar reads avoid retaining a stale Payment in the persistence context
    // while waiting for the booking mutex.
    @Query("select p.bookingId from Payment p where p.id = :id")
    Optional<UUID> findBookingIdById(@Param("id") UUID id);

    @Query("select distinct p.bookingId from Payment p where p.paymentOrderId = :orderId")
    List<UUID> findBookingIdsByPaymentOrderId(@Param("orderId") UUID orderId);

    List<Payment> findAllByStatusAndWalletAppliedTrueAndRevenueReleasedFalseOrderByPaidAtAsc(
            PaymentStatus status
    );

    @Query("""
            select coalesce(sum(p.amount), 0)
            from Payment p
            where p.bookingId = :bookingId and p.status = :status
              and p.paidAt is not null and p.paidAt <= :settledAtOrBefore
            """)
    BigDecimal sumAmountByBookingIdAndStatusAtOrBefore(
            @Param("bookingId") UUID bookingId,
            @Param("status") PaymentStatus status,
            @Param("settledAtOrBefore") Instant settledAtOrBefore
    );

    @Query("""
            select distinct p.customerId
            from Payment p
            where p.bookingId = :bookingId and p.status = :status
              and p.paidAt is not null and p.paidAt <= :settledAtOrBefore
            """)
    List<UUID> findDistinctCustomerIdsByBookingIdAndStatusAtOrBefore(
            @Param("bookingId") UUID bookingId,
            @Param("status") PaymentStatus status,
            @Param("settledAtOrBefore") Instant settledAtOrBefore
    );

    @Query("""
            select count(p)
            from Payment p
            where p.bookingId = :bookingId
              and (
                    (p.status = :paidStatus
                     and (p.method = :cashMethod or p.revenueReleased = true
                          or p.walletApplied = false or p.bookingApplied = false
                          or p.paidAt is null))
                    or p.status = :refundedStatus
              )
            """)
    long countUnsafeRoomChangeExposure(
            @Param("bookingId") UUID bookingId,
            @Param("paidStatus") PaymentStatus paidStatus,
            @Param("refundedStatus") PaymentStatus refundedStatus,
            @Param("cashMethod") PaymentMethod cashMethod
    );
}
