package com.smarthotel.hotel.roomtype.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "room_types")
public class RoomType {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "base_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal basePrice;

    @Column(name = "approved_base_price", precision = 12, scale = 2)
    private BigDecimal approvedBasePrice;

    @Column(name = "max_adults", nullable = false)
    private Integer maxAdults;

    @Column(name = "max_children", nullable = false)
    private Integer maxChildren;

    @Column(name = "bed_type", length = 80)
    private String bedType;

    @Column(name = "bed_count", nullable = false)
    private Integer bedCount;

    @Column(name = "area_sqm", precision = 8, scale = 2)
    private BigDecimal areaSqm;

    @Column(name = "breakfast_included", nullable = false)
    private boolean breakfastIncluded;

    @Column(name = "refundable", nullable = false)
    private boolean refundable;

    @Column(name = "smoking_allowed", nullable = false)
    private boolean smokingAllowed;

    @Column(name = "pay_at_hotel_allowed", nullable = false)
    private boolean payAtHotelAllowed;

    @Column(name = "deposit_allowed", nullable = false)
    private boolean depositAllowed;

    @Column(name = "deposit_percent", nullable = false)
    private Integer depositPercent;

    @Column(name = "full_payment_allowed", nullable = false)
    private boolean fullPaymentAllowed;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "room_type_amenities",
            joinColumns = @JoinColumn(name = "room_type_id")
    )
    @Column(name = "amenity", nullable = false, length = 100)
    private Set<String> amenities = new LinkedHashSet<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RoomTypeStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status", nullable = false, length = 30)
    private RoomTypeApprovalStatus approvalStatus;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected RoomType() {
    }

    public RoomType(
            UUID hotelId,
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            Integer bedCount,
            BigDecimal areaSqm,
            boolean breakfastIncluded,
            boolean refundable,
            boolean smokingAllowed,
            boolean payAtHotelAllowed,
            boolean depositAllowed,
            Integer depositPercent,
            boolean fullPaymentAllowed,
            Set<String> amenities
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.hotelId = hotelId;
        applyDetails(
                name, description, basePrice, maxAdults, maxChildren,
                bedType, bedCount, areaSqm, breakfastIncluded,
                refundable, smokingAllowed, payAtHotelAllowed,
                depositAllowed, depositPercent, fullPaymentAllowed,
                amenities
        );
        this.status = RoomTypeStatus.ACTIVE;
        this.approvalStatus = RoomTypeApprovalStatus.DRAFT;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            Integer bedCount,
            BigDecimal areaSqm,
            boolean breakfastIncluded,
            boolean refundable,
            boolean smokingAllowed,
            boolean payAtHotelAllowed,
            boolean depositAllowed,
            Integer depositPercent,
            boolean fullPaymentAllowed,
            Set<String> amenities,
            RoomTypeStatus status,
            boolean requiresReapproval
    ) {
        applyDetails(
                name, description, basePrice, maxAdults, maxChildren,
                bedType, bedCount, areaSqm, breakfastIncluded,
                refundable, smokingAllowed, payAtHotelAllowed,
                depositAllowed, depositPercent, fullPaymentAllowed,
                amenities
        );
        this.status = status;

        if (this.approvalStatus == RoomTypeApprovalStatus.PENDING
                || this.approvalStatus == RoomTypeApprovalStatus.REJECTED
                || (this.approvalStatus == RoomTypeApprovalStatus.APPROVED && requiresReapproval)) {
            resetApprovalToDraft();
        }

        this.updatedAt = Instant.now();
    }


    public void submitForApproval() {
        if (approvalStatus != RoomTypeApprovalStatus.DRAFT
                && approvalStatus != RoomTypeApprovalStatus.REJECTED) {
            throw new IllegalStateException("Loại phòng không ở trạng thái có thể gửi duyệt");
        }
        approvalStatus = RoomTypeApprovalStatus.PENDING;
        rejectionReason = null;
        submittedAt = Instant.now();
        reviewedAt = null;
        reviewedBy = null;
        updatedAt = Instant.now();
    }

    public void approve(UUID systemAdminId) {
        if (approvalStatus != RoomTypeApprovalStatus.PENDING) {
            throw new IllegalStateException("Chỉ loại phòng đang chờ duyệt mới có thể được phê duyệt");
        }
        approvalStatus = RoomTypeApprovalStatus.APPROVED;
        approvedBasePrice = basePrice;
        rejectionReason = null;
        reviewedAt = Instant.now();
        reviewedBy = systemAdminId;
        updatedAt = Instant.now();
    }

    public void reject(UUID systemAdminId, String reason) {
        if (approvalStatus != RoomTypeApprovalStatus.PENDING) {
            throw new IllegalStateException("Chỉ loại phòng đang chờ duyệt mới có thể bị từ chối");
        }
        approvalStatus = RoomTypeApprovalStatus.REJECTED;
        rejectionReason = reason;
        reviewedAt = Instant.now();
        reviewedBy = systemAdminId;
        updatedAt = Instant.now();
    }

    private void resetApprovalToDraft() {
        this.approvalStatus = RoomTypeApprovalStatus.DRAFT;
        this.rejectionReason = null;
        this.submittedAt = null;
        this.reviewedAt = null;
        this.reviewedBy = null;
    }

    public void deactivate() {
        this.status = RoomTypeStatus.INACTIVE;
        this.updatedAt = Instant.now();
    }

    private void applyDetails(
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            Integer bedCount,
            BigDecimal areaSqm,
            boolean breakfastIncluded,
            boolean refundable,
            boolean smokingAllowed,
            boolean payAtHotelAllowed,
            boolean depositAllowed,
            Integer depositPercent,
            boolean fullPaymentAllowed,
            Set<String> amenities
    ) {
        validatePaymentPolicy(
                payAtHotelAllowed,
                depositAllowed,
                depositPercent,
                fullPaymentAllowed
        );

        this.name = name;
        this.description = description;
        this.basePrice = basePrice;
        this.maxAdults = maxAdults;
        this.maxChildren = maxChildren;
        this.bedType = bedType;
        this.bedCount = bedCount == null ? 1 : bedCount;
        this.areaSqm = areaSqm;
        this.breakfastIncluded = breakfastIncluded;
        this.refundable = refundable;
        this.smokingAllowed = smokingAllowed;
        this.payAtHotelAllowed = payAtHotelAllowed;
        this.depositAllowed = depositAllowed;
        this.depositPercent = depositPercent == null ? 30 : depositPercent;
        this.fullPaymentAllowed = fullPaymentAllowed;
        this.amenities.clear();
        if (amenities != null) {
            this.amenities.addAll(amenities);
        }
    }

    private void validatePaymentPolicy(
            boolean payAtHotelAllowed,
            boolean depositAllowed,
            Integer depositPercent,
            boolean fullPaymentAllowed
    ) {
        if (!payAtHotelAllowed && !depositAllowed && !fullPaymentAllowed) {
            throw new IllegalArgumentException(
                    "Phải cho phép ít nhất một phương thức thanh toán"
            );
        }

        if (depositAllowed) {
            if (depositPercent == null || depositPercent < 1 || depositPercent > 99) {
                throw new IllegalArgumentException(
                        "Tỷ lệ đặt cọc phải nằm trong khoảng 1% đến 99%"
                );
            }
        }
    }

    public UUID getId() { return id; }
    public UUID getHotelId() { return hotelId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public BigDecimal getBasePrice() { return basePrice; }
    public BigDecimal getApprovedBasePrice() { return approvedBasePrice; }
    public Integer getMaxAdults() { return maxAdults; }
    public Integer getMaxChildren() { return maxChildren; }
    public String getBedType() { return bedType; }
    public Integer getBedCount() { return bedCount; }
    public BigDecimal getAreaSqm() { return areaSqm; }
    public boolean isBreakfastIncluded() { return breakfastIncluded; }
    public boolean isRefundable() { return refundable; }
    public boolean isSmokingAllowed() { return smokingAllowed; }
    public boolean isPayAtHotelAllowed() { return payAtHotelAllowed; }
    public boolean isDepositAllowed() { return depositAllowed; }
    public Integer getDepositPercent() { return depositPercent; }
    public boolean isFullPaymentAllowed() { return fullPaymentAllowed; }
    public Set<String> getAmenities() { return amenities; }
    public RoomTypeStatus getStatus() { return status; }
    public RoomTypeApprovalStatus getApprovalStatus() { return approvalStatus; }
    public String getRejectionReason() { return rejectionReason; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public UUID getReviewedBy() { return reviewedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
