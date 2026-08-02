package com.smarthotel.payment.payment.dto;

import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        UUID bookingId,
        UUID customerId,
        BigDecimal amount,
        PaymentMethod method,
        PaymentStatus status,
        String transactionCode,
        String failureReason,
        Instant paidAt,
        Instant refundedAt,
        Instant createdAt,
        Instant updatedAt
) {

    public static PaymentResponse from(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getBookingId(),
                payment.getCustomerId(),
                payment.getAmount(),
                payment.getMethod(),
                payment.getStatus(),
                payment.getTransactionCode(),
                payment.getFailureReason(),
                payment.getPaidAt(),
                payment.getRefundedAt(),
                payment.getCreatedAt(),
                payment.getUpdatedAt()
        );
    }
}