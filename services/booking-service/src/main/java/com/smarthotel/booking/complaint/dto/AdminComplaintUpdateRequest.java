package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.ComplaintResolutionType;
import com.smarthotel.booking.complaint.entity.ComplaintSeverity;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import java.math.BigDecimal;

import java.util.UUID;

public record AdminComplaintUpdateRequest(
        @NotNull ComplaintStatus status,
        ComplaintResolutionType resolutionType,
        @Size(max = 5000) String note,
        UUID refundRequestId,
        ComplaintSeverity severity,
        boolean visibleToCustomer,
        @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal requiredRefundAmount,
        Boolean violationReviewRecommended,
        boolean refundVerified
) {
    public AdminComplaintUpdateRequest(ComplaintStatus status, ComplaintResolutionType resolutionType,
            String note, UUID refundRequestId, ComplaintSeverity severity, boolean visibleToCustomer) {
        this(status, resolutionType, note, refundRequestId, severity, visibleToCustomer, null, null, false);
    }
}
