package com.smarthotel.booking.booking.roomchange;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "room_change_requests")
public class RoomChangeRequest {

    protected RoomChangeRequest() {
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "original_room_id", nullable = false)
    private UUID originalRoomId;

    @Column(name = "original_room_type_id")
    private UUID originalRoomTypeId;

    @Column(name = "target_room_id")
    private UUID targetRoomId;

    @Column(name = "target_room_type_id")
    private UUID targetRoomTypeId;

    @Column(name = "reason", nullable = false, length = 1000)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RoomChangeRequestStatus status;

    @Column(name = "review_note", length = 1000)
    private String reviewNote;

    @Column(name = "old_total_price", precision = 14, scale = 2)
    private BigDecimal oldTotalPrice;

    @Column(name = "new_total_price", precision = 14, scale = 2)
    private BigDecimal newTotalPrice;

    @Column(name = "price_difference", precision = 14, scale = 2)
    private BigDecimal priceDifference;

    @Column(name = "additional_payment_due", precision = 14, scale = 2)
    private BigDecimal additionalPaymentDue;

    @Column(name = "financial_reconciliation_status", nullable = false, length = 30)
    private String financialReconciliationStatus = "NOT_REQUIRED";

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    public RoomChangeRequest(
            UUID bookingId,
            UUID customerId,
            UUID hotelId,
            UUID originalRoomId,
            UUID originalRoomTypeId,
            UUID targetRoomId,
            UUID targetRoomTypeId,
            String reason
    ) {
        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.originalRoomId = originalRoomId;
        this.originalRoomTypeId = originalRoomTypeId;
        this.targetRoomId = targetRoomId;
        this.targetRoomTypeId = targetRoomTypeId;
        this.reason = normalizeRequired(reason);
        this.status = RoomChangeRequestStatus.PENDING;
        this.requestedAt = Instant.now();
    }

    public void approve(
            UUID reviewedBy,
            UUID targetRoomId,
            UUID targetRoomTypeId,
            BigDecimal oldTotalPrice,
            BigDecimal newTotalPrice,
            BigDecimal priceDifference,
            BigDecimal additionalPaymentDue,
            String reviewNote
    ) {
        ensurePending();
        this.reviewedBy = reviewedBy;
        this.targetRoomId = targetRoomId;
        this.targetRoomTypeId = targetRoomTypeId;
        this.oldTotalPrice = oldTotalPrice;
        this.newTotalPrice = newTotalPrice;
        this.priceDifference = priceDifference;
        this.additionalPaymentDue = additionalPaymentDue;
        // A newly approved legacy flow has a calculated due; historical rows alone are not confirmation proof.
        this.financialReconciliationStatus = "NOT_REQUIRED";
        this.reviewNote = normalizeNullable(reviewNote);
        this.status = RoomChangeRequestStatus.APPROVED;
        this.reviewedAt = Instant.now();
    }

    public void reject(UUID reviewedBy, String reviewNote) {
        ensurePending();
        this.reviewedBy = reviewedBy;
        this.reviewNote = normalizeNullable(reviewNote);
        this.status = RoomChangeRequestStatus.REJECTED;
        this.reviewedAt = Instant.now();
    }

    public void awaitFinancialConfirmation() {
        if (status != RoomChangeRequestStatus.APPROVED) throw new IllegalStateException("REQUEST_NOT_APPROVED");
        this.financialReconciliationStatus = "PENDING";
        this.additionalPaymentDue = null;
    }

    public void applyFinancialResult(BigDecimal newTotal, BigDecimal netRetained, String outcome) {
        if (status != RoomChangeRequestStatus.APPROVED
                || !("PENDING".equals(financialReconciliationStatus) || "LEGACY".equals(financialReconciliationStatus))
                || newTotalPrice == null || newTotalPrice.compareTo(newTotal) != 0) {
            throw new IllegalStateException("REQUEST_FINANCIAL_RESULT_MISMATCH");
        }
        if ("CONFIRMED".equals(outcome) && netRetained != null && netRetained.signum() >= 0) {
            additionalPaymentDue = newTotal.subtract(netRetained).max(BigDecimal.ZERO);
        } else if ("RECONCILIATION_REQUIRED".equals(outcome) && netRetained == null) {
            additionalPaymentDue = null;
        } else {
            throw new IllegalArgumentException("INVALID_REQUEST_FINANCIAL_RESULT");
        }
        financialReconciliationStatus = outcome;
    }

    private void ensurePending() {
        if (status != RoomChangeRequestStatus.PENDING) {
            throw new IllegalStateException("Yêu cầu đổi phòng đã được xử lý");
        }
    }

    private static String normalizeRequired(String value) {
        String normalized = normalizeNullable(value);
        if (normalized == null) {
            throw new IllegalArgumentException("Lý do đổi phòng không được để trống");
        }
        return normalized;
    }

    private static String normalizeNullable(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public UUID getCustomerId() { return customerId; }
    public UUID getHotelId() { return hotelId; }
    public UUID getOriginalRoomId() { return originalRoomId; }
    public UUID getOriginalRoomTypeId() { return originalRoomTypeId; }
    public UUID getTargetRoomId() { return targetRoomId; }
    public UUID getTargetRoomTypeId() { return targetRoomTypeId; }
    public String getReason() { return reason; }
    public RoomChangeRequestStatus getStatus() { return status; }
    public String getReviewNote() { return reviewNote; }
    public BigDecimal getOldTotalPrice() { return oldTotalPrice; }
    public BigDecimal getNewTotalPrice() { return newTotalPrice; }
    public BigDecimal getPriceDifference() { return priceDifference; }
    public BigDecimal getAdditionalPaymentDue() { return additionalPaymentDue; }
    public String getFinancialReconciliationStatus() { return financialReconciliationStatus; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public UUID getReviewedBy() { return reviewedBy; }
}
