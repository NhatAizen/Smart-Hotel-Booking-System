package com.smarthotel.payment.payment.repository;

import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    List<Payment> findAllByBookingIdOrderByCreatedAtDesc(
            UUID bookingId
    );

    List<Payment> findAllByCustomerIdOrderByCreatedAtDesc(
            UUID customerId
    );

    List<Payment> findAllByStatusOrderByCreatedAtDesc(
            PaymentStatus status
    );

    boolean existsByTransactionCode(String transactionCode);
}