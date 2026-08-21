package com.smarthotel.payment.refund.dto;

import com.smarthotel.payment.refund.entity.RefundRequest;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record RefundRequestResponse(
        UUID id,
        UUID bookingId,
        String bookingCode,
        UUID customerId,
        UUID hotelId,
        UUID hotelOwnerId,
        String bookingStatusSnapshot,
        String paymentOptionSnapshot,
        String reasonCode,
        String customerNote,
        String policyCode,
        String policyMessage,
        BigDecimal totalPaidAmount,
        BigDecimal platformHeldAmount,
        BigDecimal hotelDirectAmount,
        BigDecimal manualReconciliationAmount,
        String refundBankName,
        String refundAccountNumber,
        String refundAccountName,
        RefundRequestStatus status,
        UUID reviewedBy,
        String reviewNote,
        Instant reviewedAt,
        boolean platformRefundCompleted,
        boolean hotelRefundCompleted,
        boolean hotelRefundProofAvailable,
        String hotelRefundReference,
        boolean manualReconciliationCompleted,
        String manualResolutionNote,
        Instant requestedAt,
        Instant completedAt,
        Instant updatedAt
) {
    public static RefundRequestResponse from(RefundRequest item) {
        return new RefundRequestResponse(
                item.getId(), item.getBookingId(), item.getBookingCode(), item.getCustomerId(),
                item.getHotelId(), item.getHotelOwnerId(), item.getBookingStatusSnapshot(),
                item.getPaymentOptionSnapshot(), item.getReasonCode(), item.getCustomerNote(),
                item.getPolicyCode(), item.getPolicyMessage(), item.getTotalPaidAmount(),
                item.getPlatformHeldAmount(), item.getHotelDirectAmount(), item.getManualReconciliationAmount(),
                item.getRefundBankName(), item.getRefundAccountNumber(), item.getRefundAccountName(),
                item.getStatus(), item.getReviewedBy(), item.getReviewNote(), item.getReviewedAt(),
                item.getPlatformHeldAmount().signum() <= 0 || item.getPlatformRefundedAt() != null,
                item.getHotelDirectAmount().signum() <= 0 || item.getHotelRefundedAt() != null,
                item.hasHotelRefundProof(), item.getHotelRefundReference(),
                item.getManualReconciliationAmount().signum() <= 0 || item.getManualResolvedAt() != null,
                item.getManualResolutionNote(), item.getRequestedAt(), item.getCompletedAt(), item.getUpdatedAt()
        );
    }
}
