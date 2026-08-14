package com.smarthotel.payment.payment.dto;

import com.smarthotel.payment.payment.entity.PaymentOrder;
import com.smarthotel.payment.payment.entity.PaymentOrderStatus;
import com.smarthotel.payment.payment.entity.PaymentType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PaymentOrderResponse(
        UUID id,
        Long orderCode,
        UUID customerId,
        PaymentType paymentType,
        BigDecimal amount,
        PaymentOrderStatus status,
        String description,
        String paymentLinkId,
        String checkoutUrl,
        String qrCode,
        String providerStatus,
        String providerReference,
        String failureReason,
        Instant expiresAt,
        Instant paidAt,
        Instant cancelledAt,
        Instant createdAt,
        Instant updatedAt,
        List<PaymentResponse> payments
) {
    public static PaymentOrderResponse from(
            PaymentOrder order,
            List<PaymentResponse> payments
    ) {
        return new PaymentOrderResponse(
                order.getId(), order.getOrderCode(), order.getCustomerId(),
                order.getPaymentType(), order.getAmount(), order.getStatus(),
                order.getDescription(), order.getPaymentLinkId(),
                order.getCheckoutUrl(), order.getQrCode(),
                order.getProviderStatus(), order.getProviderReference(),
                order.getFailureReason(), order.getExpiresAt(), order.getPaidAt(),
                order.getCancelledAt(), order.getCreatedAt(), order.getUpdatedAt(),
                payments
        );
    }
}
