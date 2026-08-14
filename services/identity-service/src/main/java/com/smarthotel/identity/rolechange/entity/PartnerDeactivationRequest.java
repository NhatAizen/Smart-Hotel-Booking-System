package com.smarthotel.identity.rolechange.entity;

import com.smarthotel.identity.rolechange.exception.RoleChangeConflictException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "partner_deactivation_requests")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PartnerDeactivationRequest {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PartnerDeactivationStatus status;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PartnerDeactivationRequest(UUID userId, String reason) {
        this.userId = userId;
        this.reason = normalize(reason);
        this.status = PartnerDeactivationStatus.PENDING;
    }

    @PrePersist
    private void prePersist() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        requestedAt = now;
        updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        updatedAt = Instant.now();
    }

    public void approve(UUID systemAdminId) {
        ensurePending();
        status = PartnerDeactivationStatus.APPROVED;
        reviewedBy = systemAdminId;
        reviewedAt = Instant.now();
        rejectionReason = null;
    }

    public void reject(UUID systemAdminId, String reason) {
        ensurePending();
        status = PartnerDeactivationStatus.REJECTED;
        reviewedBy = systemAdminId;
        reviewedAt = Instant.now();
        rejectionReason = normalize(reason);
    }

    private void ensurePending() {
        if (status != PartnerDeactivationStatus.PENDING) {
            throw new RoleChangeConflictException(
                    "Chỉ yêu cầu ngừng làm đối tác đang chờ mới được xử lý"
            );
        }
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Lý do không được để trống");
        }
        return value.trim();
    }
}
