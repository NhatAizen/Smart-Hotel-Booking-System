package com.smarthotel.payment.payment.dto;

import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.entity.PaymentType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        UUID paymentOrderId,
        UUID bookingId,
        UUID customerId,
        UUID hotelId,
        UUID hotelOwnerId,
        BigDecimal amount,
        PaymentMethod method,
        PaymentType paymentType,
        PaymentStatus status,
        BigDecimal commissionRate,
        BigDecimal commissionAmount,
        BigDecimal hotelNetAmount,
        boolean bookingApplied,
        boolean walletApplied,
        boolean revenueReleased,
        String transactionCode,
        String failureReason,
        Instant paidAt,
        Instant refundedAt,
        Instant createdAt,
        Instant updatedAt
) {
    public static PaymentResponse from(Payment payment) {
        return new PaymentResponse(
                payment.getId(), payment.getPaymentOrderId(), payment.getBookingId(),
                payment.getCustomerId(), payment.getHotelId(), payment.getHotelOwnerId(),
                payment.getAmount(), payment.getMethod(), payment.getPaymentType(),
                payment.getStatus(), payment.getCommissionRate(),
                payment.getCommissionAmount(), payment.getHotelNetAmount(),
                payment.isBookingApplied(), payment.isWalletApplied(),
                payment.isRevenueReleased(), payment.getTransactionCode(),
                payment.getFailureReason(), payment.getPaidAt(),
                payment.getRefundedAt(), payment.getCreatedAt(), payment.getUpdatedAt()
        );
    }
}
