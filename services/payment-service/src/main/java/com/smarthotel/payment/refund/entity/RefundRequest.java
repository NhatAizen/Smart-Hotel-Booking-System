package com.smarthotel.payment.refund.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refund_requests")
public class RefundRequest {
    protected RefundRequest() {}

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "booking_code", nullable = false, length = 40)
    private String bookingCode;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "hotel_owner_id", nullable = false)
    private UUID hotelOwnerId;

    @Column(name = "booking_status_snapshot", nullable = false, length = 30)
    private String bookingStatusSnapshot;

    @Column(name = "payment_option_snapshot", length = 30)
    private String paymentOptionSnapshot;

    @Column(name = "reason_code", nullable = false, length = 60)
    private String reasonCode;

    @Column(name = "customer_note", length = 1000)
    private String customerNote;

    @Column(name = "policy_code", nullable = false, length = 60)
    private String policyCode;

    @Column(name = "policy_message", nullable = false, length = 1000)
    private String policyMessage;

    @Column(name = "total_paid_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal totalPaidAmount;

    @Column(name = "platform_held_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal platformHeldAmount;

    @Column(name = "hotel_direct_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal hotelDirectAmount;

    @Column(name = "manual_reconciliation_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal manualReconciliationAmount;

    @Column(name = "refund_bank_name", length = 120)
    private String refundBankName;

    @Column(name = "refund_account_number", length = 60)
    private String refundAccountNumber;

    @Column(name = "refund_account_name", length = 180)
    private String refundAccountName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private RefundRequestStatus status;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "review_note", length = 1000)
    private String reviewNote;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "platform_refunded_at")
    private Instant platformRefundedAt;

    @Column(name = "hotel_refunded_at")
    private Instant hotelRefundedAt;

    @Column(name = "hotel_refund_reference", length = 180)
    private String hotelRefundReference;

    @Column(name = "hotel_refund_proof_data", columnDefinition = "bytea")
    private byte[] hotelRefundProofData;

    @Column(name = "hotel_refund_proof_content_type", length = 100)
    private String hotelRefundProofContentType;

    @Column(name = "hotel_refund_proof_file_name", length = 255)
    private String hotelRefundProofFileName;

    @Column(name = "manual_resolved_at")
    private Instant manualResolvedAt;

    @Column(name = "manual_resolved_by")
    private UUID manualResolvedBy;

    @Column(name = "manual_resolution_note", length = 1000)
    private String manualResolutionNote;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public RefundRequest(
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
            String refundAccountName
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.bookingCode = cleanRequired(bookingCode, "Booking code is required");
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.hotelOwnerId = hotelOwnerId;
        this.bookingStatusSnapshot = cleanRequired(bookingStatusSnapshot, "Booking status is required");
        this.paymentOptionSnapshot = clean(paymentOptionSnapshot);
        this.reasonCode = cleanRequired(reasonCode, "Refund reason is required");
        this.customerNote = clean(customerNote);
        this.policyCode = cleanRequired(policyCode, "Refund policy code is required");
        this.policyMessage = cleanRequired(policyMessage, "Refund policy message is required");
        this.totalPaidAmount = money(totalPaidAmount);
        this.platformHeldAmount = money(platformHeldAmount);
        this.hotelDirectAmount = money(hotelDirectAmount);
        this.manualReconciliationAmount = money(manualReconciliationAmount);
        this.refundBankName = clean(refundBankName);
        this.refundAccountNumber = clean(refundAccountNumber);
        this.refundAccountName = clean(refundAccountName);
        this.status = RefundRequestStatus.PENDING_HOTEL_REVIEW;
        this.requestedAt = now;
        this.updatedAt = now;
    }

    public void approve(UUID hotelAdminId, String note) {
        ensure(RefundRequestStatus.PENDING_HOTEL_REVIEW);
        this.status = RefundRequestStatus.APPROVED;
        this.reviewedBy = hotelAdminId;
        this.reviewNote = clean(note);
        this.reviewedAt = Instant.now();
        this.updatedAt = this.reviewedAt;
        refreshCompletionState();
    }

    public void reject(UUID hotelAdminId, String note) {
        ensure(RefundRequestStatus.PENDING_HOTEL_REVIEW);
        this.status = RefundRequestStatus.REJECTED;
        this.reviewedBy = hotelAdminId;
        this.reviewNote = cleanRequired(note, "Vui lòng nhập lý do từ chối");
        this.reviewedAt = Instant.now();
        this.updatedAt = this.reviewedAt;
    }

    public void markPlatformRefunded() {
        ensureApproved();
        this.platformRefundedAt = Instant.now();
        this.updatedAt = this.platformRefundedAt;
        refreshCompletionState();
    }

    public void attachHotelRefundProof(byte[] data, String contentType, String fileName, String reference) {
        ensureApproved();
        if (hotelDirectAmount.signum() <= 0) {
            throw new IllegalStateException("Yêu cầu này không có khoản tiền khách sạn phải hoàn trực tiếp");
        }
        if (data == null || data.length == 0) {
            throw new IllegalArgumentException("Vui lòng tải chứng từ hoàn tiền của khách sạn");
        }
        this.hotelRefundProofData = data;
        this.hotelRefundProofContentType = clean(contentType);
        this.hotelRefundProofFileName = clean(fileName);
        this.hotelRefundReference = cleanRequired(reference, "Vui lòng nhập mã giao dịch hoàn tiền");
        this.hotelRefundedAt = Instant.now();
        this.updatedAt = this.hotelRefundedAt;
        refreshCompletionState();
    }

    public void markManualResolved(UUID adminId, String note) {
        ensureApproved();
        if (manualReconciliationAmount.signum() <= 0) {
            throw new IllegalStateException("Yêu cầu này không có khoản cần đối soát thủ công");
        }
        this.manualResolvedAt = Instant.now();
        this.manualResolvedBy = adminId;
        this.manualResolutionNote = cleanRequired(note, "Vui lòng ghi nội dung đối soát thủ công");
        this.updatedAt = this.manualResolvedAt;
        refreshCompletionState();
    }

    public void refreshCompletionState() {
        if (status == RefundRequestStatus.REJECTED || status == RefundRequestStatus.PENDING_HOTEL_REVIEW) {
            return;
        }
        boolean platformDone = platformHeldAmount.signum() <= 0 || platformRefundedAt != null;
        boolean hotelDone = hotelDirectAmount.signum() <= 0 || hotelRefundedAt != null;
        boolean manualDone = manualReconciliationAmount.signum() <= 0 || manualResolvedAt != null;

        if (platformDone && hotelDone && manualDone) {
            this.status = RefundRequestStatus.COMPLETED;
            if (this.completedAt == null) this.completedAt = Instant.now();
        } else if (platformRefundedAt != null || hotelRefundedAt != null || manualResolvedAt != null) {
            this.status = RefundRequestStatus.PARTIALLY_COMPLETED;
        } else {
            this.status = RefundRequestStatus.APPROVED;
        }
        this.updatedAt = Instant.now();
    }

    private void ensureApproved() {
        if (status != RefundRequestStatus.APPROVED && status != RefundRequestStatus.PARTIALLY_COMPLETED) {
            throw new IllegalStateException("Yêu cầu hoàn tiền chưa được Hotel Admin duyệt");
        }
    }

    private void ensure(RefundRequestStatus expected) {
        if (status != expected) {
            throw new IllegalStateException("Trạng thái yêu cầu hoàn tiền không hợp lệ: " + status);
        }
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(0, RoundingMode.HALF_UP);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String cleanRequired(String value, String message) {
        String cleaned = clean(value);
        if (cleaned == null) throw new IllegalArgumentException(message);
        return cleaned;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public String getBookingCode() { return bookingCode; }
    public UUID getCustomerId() { return customerId; }
    public UUID getHotelId() { return hotelId; }
    public UUID getHotelOwnerId() { return hotelOwnerId; }
    public String getBookingStatusSnapshot() { return bookingStatusSnapshot; }
    public String getPaymentOptionSnapshot() { return paymentOptionSnapshot; }
    public String getReasonCode() { return reasonCode; }
    public String getCustomerNote() { return customerNote; }
    public String getPolicyCode() { return policyCode; }
    public String getPolicyMessage() { return policyMessage; }
    public BigDecimal getTotalPaidAmount() { return totalPaidAmount; }
    public BigDecimal getPlatformHeldAmount() { return platformHeldAmount; }
    public BigDecimal getHotelDirectAmount() { return hotelDirectAmount; }
    public BigDecimal getManualReconciliationAmount() { return manualReconciliationAmount; }
    public String getRefundBankName() { return refundBankName; }
    public String getRefundAccountNumber() { return refundAccountNumber; }
    public String getRefundAccountName() { return refundAccountName; }
    public RefundRequestStatus getStatus() { return status; }
    public UUID getReviewedBy() { return reviewedBy; }
    public String getReviewNote() { return reviewNote; }
    public Instant getReviewedAt() { return reviewedAt; }
    public Instant getPlatformRefundedAt() { return platformRefundedAt; }
    public Instant getHotelRefundedAt() { return hotelRefundedAt; }
    public String getHotelRefundReference() { return hotelRefundReference; }
    public byte[] getHotelRefundProofData() { return hotelRefundProofData; }
    public String getHotelRefundProofContentType() { return hotelRefundProofContentType; }
    public String getHotelRefundProofFileName() { return hotelRefundProofFileName; }
    public boolean hasHotelRefundProof() { return hotelRefundProofData != null && hotelRefundProofData.length > 0; }
    public Instant getManualResolvedAt() { return manualResolvedAt; }
    public UUID getManualResolvedBy() { return manualResolvedBy; }
    public String getManualResolutionNote() { return manualResolutionNote; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
