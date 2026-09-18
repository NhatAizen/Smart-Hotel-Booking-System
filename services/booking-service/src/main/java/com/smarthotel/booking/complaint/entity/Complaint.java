package com.smarthotel.booking.complaint.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import java.util.Set;

@Entity
@Table(name = "complaints")
public class Complaint {
    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "complaint_code", nullable = false, unique = true, length = 40)
    private String complaintCode;
    @Column(name = "booking_id", nullable = false) private UUID bookingId;
    @Column(name = "booking_code", nullable = false, length = 40) private String bookingCode;
    @Column(name = "customer_id", nullable = false) private UUID customerId;
    @Column(name = "customer_name_snapshot", nullable = false, length = 200) private String customerNameSnapshot;
    @Column(name = "hotel_id", nullable = false) private UUID hotelId;
    @Column(name = "hotel_owner_id", nullable = false) private UUID hotelOwnerId;
    @Column(name = "hotel_name_snapshot", nullable = false, length = 255) private String hotelNameSnapshot;
    @Column(name = "room_type_id") private UUID roomTypeId;
    @Column(name = "room_type_name_snapshot", length = 255) private String roomTypeNameSnapshot;
    @Column(name = "room_id", nullable = false) private UUID roomId;
    @Column(name = "room_number_snapshot", length = 80) private String roomNumberSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "issue_type", nullable = false, length = 50)
    private ComplaintIssueType issueType;
    @Column(nullable = false, length = 180) private String title;
    @Column(nullable = false, columnDefinition = "TEXT") private String description;
    @Column(name = "internal_test", nullable = false) private boolean internalTest;
    @Column(name = "disputed_amount", precision = 14, scale = 2) private BigDecimal disputedAmount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ComplaintStatus status;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ComplaintSeverity severity;
    @Enumerated(EnumType.STRING)
    @Column(name = "resolution_type", length = 60)
    private ComplaintResolutionType resolutionType;
    @Column(name = "resolution_note", columnDefinition = "TEXT") private String resolutionNote;
    @Column(name = "refund_request_id") private UUID refundRequestId;
    @Column(name = "violation_review_recommended", nullable = false) private boolean violationReviewRecommended;
    @Column(name = "resolved_by") private UUID resolvedBy;
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "escalated_at") private Instant escalatedAt;
    @Column(name = "hotel_completed_at") private Instant hotelCompletedAt;
    @Column(name = "required_refund_amount", precision = 14, scale = 2) private BigDecimal requiredRefundAmount;
    @Column(name = "hotel_reported_refund_amount", precision = 14, scale = 2) private BigDecimal hotelReportedRefundAmount;
    @Enumerated(EnumType.STRING)
    @Column(name = "resolved_by_role", length = 30) private ComplaintActorRole resolvedByRole;
    @Version private long version;

    protected Complaint() {}

    public Complaint(UUID bookingId, String bookingCode, UUID customerId, String customerName,
                     UUID hotelId, UUID hotelOwnerId, String hotelName, UUID roomTypeId,
                     String roomTypeName, UUID roomId, String roomNumber,
                     ComplaintIssueType issueType, String title, String description,
                     BigDecimal disputedAmount) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.complaintCode = generateCode(now);
        this.bookingId = bookingId;
        this.bookingCode = required(bookingCode);
        this.customerId = customerId;
        this.customerNameSnapshot = required(customerName);
        this.hotelId = hotelId;
        this.hotelOwnerId = hotelOwnerId;
        this.hotelNameSnapshot = required(hotelName);
        this.roomTypeId = roomTypeId;
        this.roomTypeNameSnapshot = clean(roomTypeName);
        this.roomId = roomId;
        this.roomNumberSnapshot = clean(roomNumber);
        this.issueType = issueType;
        this.title = required(title);
        this.description = required(description);
        this.disputedAmount = disputedAmount == null ? null : disputedAmount.setScale(2, RoundingMode.HALF_UP);
        this.status = ComplaintStatus.SUBMITTED;
        this.severity = ComplaintSeverity.NORMAL;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void hotelReview(boolean requestEvidence) {
        requireHotelStage();
        move(requestEvidence ? ComplaintStatus.WAITING_FOR_CUSTOMER : ComplaintStatus.UNDER_REVIEW);
    }

    public void escalate() {
        requireHotelStage();
        this.escalatedAt = Instant.now();
        move(ComplaintStatus.ESCALATED);
    }

    public void hotelResolve(UUID actorId, String note) {
        requireHotelStage();
        this.resolutionType = ComplaintResolutionType.HOTEL_ACKNOWLEDGED_FAULT;
        finish(actorId, ComplaintActorRole.HOTEL_ADMIN, ComplaintStatus.RESOLVED, note);
    }

    public void systemReview(boolean requestEvidence) {
        requireSystemReviewStage();
        move(requestEvidence ? ComplaintStatus.WAITING_FOR_CUSTOMER : ComplaintStatus.SYSTEM_REVIEW);
    }

    public void resumeAfterCustomerEvidence() {
        if (status == ComplaintStatus.WAITING_FOR_CUSTOMER) {
            move(escalatedAt == null ? ComplaintStatus.UNDER_REVIEW : ComplaintStatus.SYSTEM_REVIEW);
        }
    }

    public void requireHotelAction(ComplaintResolutionType type, String note, BigDecimal amount,
                                   ComplaintSeverity severity, Boolean negativeAssessment) {
        if (status != ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION) requireSystemReviewStage();
        if (type != ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED
                && type != ComplaintResolutionType.FULL_REFUND_ACCEPTED
                && type != ComplaintResolutionType.PARTIAL_REFUND_ACCEPTED) {
            throw new IllegalArgumentException("Chọn yêu cầu khắc phục hoặc hoàn tiền cho khách hàng");
        }
        if (type != ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED && (amount == null || amount.signum() <= 0)) {
            throw new IllegalArgumentException("Vui lòng nhập số tiền phải hoàn");
        }
        this.resolutionType = type;
        this.resolutionNote = required(note);
        this.requiredRefundAmount = type == ComplaintResolutionType.HOTEL_SUPPORT_REQUIRED ? null : amount;
        this.severity = severity == null ? this.severity : severity;
        if (negativeAssessment != null) this.violationReviewRecommended = negativeAssessment;
        this.hotelCompletedAt = null;
        this.hotelReportedRefundAmount = null;
        this.refundRequestId = null;
        move(ComplaintStatus.HOTEL_ACTION_REQUIRED);
    }

    public void hotelCompleteAction(UUID refundId, BigDecimal refundedAmount) {
        if (status != ComplaintStatus.HOTEL_ACTION_REQUIRED) {
            throw new IllegalStateException("Chưa có yêu cầu xử lý của quản trị hệ thống");
        }
        this.refundRequestId = refundId;
        this.hotelReportedRefundAmount = refundedAmount;
        this.hotelCompletedAt = Instant.now();
        move(ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION);
    }

    public void systemConfirm(UUID adminId, String note) {
        if (status != ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION) {
            throw new IllegalStateException("Khách sạn phải thực hiện và gửi chứng cứ trước khi đóng khiếu nại");
        }
        finish(adminId, ComplaintActorRole.SYSTEM_ADMIN, ComplaintStatus.RESOLVED, note);
    }

    public void reject(UUID adminId, ComplaintResolutionType type, String note) {
        requireSystemReviewStage();
        if (type != ComplaintResolutionType.REJECTED_CUSTOMER_AT_FAULT
                && type != ComplaintResolutionType.REJECTED_INSUFFICIENT_EVIDENCE) {
            throw new IllegalArgumentException("Vui lòng nêu căn cứ bác bỏ khiếu nại");
        }
        this.resolutionType = type;
        this.violationReviewRecommended = false;
        finish(adminId, ComplaintActorRole.SYSTEM_ADMIN, ComplaintStatus.REJECTED, note);
    }

    private void requireHotelStage() {
        if (escalatedAt != null || status.isTerminal()) {
            throw new IllegalStateException("Khiếu nại đã chuyển quản trị hệ thống hoặc đã kết thúc");
        }
    }

    private void requireSystemReviewStage() {
        if (escalatedAt == null || !Set.of(ComplaintStatus.ESCALATED, ComplaintStatus.SYSTEM_REVIEW,
                ComplaintStatus.WAITING_FOR_CUSTOMER).contains(status)) {
            throw new IllegalStateException("Khiếu nại chưa được chuyển lên quản trị hệ thống hoặc không ở bước phân xử");
        }
    }

    private void finish(UUID actorId, ComplaintActorRole role, ComplaintStatus target, String note) {
        this.resolutionNote = required(note);
        this.resolvedBy = actorId;
        this.resolvedByRole = role;
        this.resolvedAt = Instant.now();
        move(target);
    }

    private void move(ComplaintStatus target) {
        this.status = target;
        this.updatedAt = Instant.now();
    }

    public void cancelByCustomer() {
        if (status.isTerminal()) throw new IllegalStateException("Khiếu nại đã kết thúc");
        if (status == ComplaintStatus.HOTEL_ACTION_REQUIRED || status == ComplaintStatus.AWAITING_SYSTEM_CONFIRMATION) {
            throw new IllegalStateException("Khiếu nại đang thực hiện quyết định của quản trị hệ thống");
        }
        this.status = ComplaintStatus.CANCELLED;
        this.cancelledAt = Instant.now();
        this.updatedAt = this.cancelledAt;
    }

    private static String generateCode(Instant instant) {
        String date = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.ROOT)
                .withZone(ZoneOffset.UTC).format(instant);
        String suffix = UUID.randomUUID().toString().replace("-", "")
                .substring(0, 8).toUpperCase(Locale.ROOT);
        return "CMP-" + date + "-" + suffix;
    }
    private static String clean(String value) {
        if (value == null) return null;
        String result = value.trim();
        return result.isEmpty() ? null : result;
    }
    private static String required(String value) {
        String result = clean(value);
        if (result == null) throw new IllegalArgumentException("Dữ liệu khiếu nại không đầy đủ");
        return result;
    }

    public UUID getId() { return id; }
    public String getComplaintCode() { return complaintCode; }
    public UUID getBookingId() { return bookingId; }
    public String getBookingCode() { return bookingCode; }
    public UUID getCustomerId() { return customerId; }
    public String getCustomerNameSnapshot() { return customerNameSnapshot; }
    public UUID getHotelId() { return hotelId; }
    public UUID getHotelOwnerId() { return hotelOwnerId; }
    public String getHotelNameSnapshot() { return hotelNameSnapshot; }
    public UUID getRoomTypeId() { return roomTypeId; }
    public String getRoomTypeNameSnapshot() { return roomTypeNameSnapshot; }
    public UUID getRoomId() { return roomId; }
    public String getRoomNumberSnapshot() { return roomNumberSnapshot; }
    public ComplaintIssueType getIssueType() { return issueType; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public BigDecimal getDisputedAmount() { return disputedAmount; }
    public ComplaintStatus getStatus() { return status; }
    public ComplaintSeverity getSeverity() { return severity; }
    public ComplaintResolutionType getResolutionType() { return resolutionType; }
    public String getResolutionNote() { return resolutionNote; }
    public UUID getRefundRequestId() { return refundRequestId; }
    public boolean isViolationReviewRecommended() { return violationReviewRecommended; }
    public UUID getResolvedBy() { return resolvedBy; }
    public Instant getResolvedAt() { return resolvedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getEscalatedAt() { return escalatedAt; }
    public Instant getHotelCompletedAt() { return hotelCompletedAt; }
    public BigDecimal getRequiredRefundAmount() { return requiredRefundAmount; }
    public BigDecimal getHotelReportedRefundAmount() { return hotelReportedRefundAmount; }
    public ComplaintActorRole getResolvedByRole() { return resolvedByRole; }
}
