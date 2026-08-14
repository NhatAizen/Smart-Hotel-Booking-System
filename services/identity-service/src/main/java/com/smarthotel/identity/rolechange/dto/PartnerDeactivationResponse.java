package com.smarthotel.identity.rolechange.dto;

import com.smarthotel.identity.rolechange.entity.PartnerDeactivationRequest;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationStatus;
import com.smarthotel.identity.user.entity.User;

import java.time.Instant;
import java.util.UUID;

public record PartnerDeactivationResponse(
        UUID id,
        UUID userId,
        String userEmail,
        String userFullName,
        String currentRole,
        String reason,
        PartnerDeactivationStatus status,
        String rejectionReason,
        UUID reviewedBy,
        Instant requestedAt,
        Instant reviewedAt,
        Instant updatedAt
) {
    public static PartnerDeactivationResponse from(
            PartnerDeactivationRequest request,
            User user
    ) {
        return new PartnerDeactivationResponse(
                request.getId(),
                request.getUserId(),
                user == null ? null : user.getEmail(),
                user == null ? null : user.getFullName(),
                user == null ? null : user.getRole().name(),
                request.getReason(),
                request.getStatus(),
                request.getRejectionReason(),
                request.getReviewedBy(),
                request.getRequestedAt(),
                request.getReviewedAt(),
                request.getUpdatedAt()
        );
    }
}
