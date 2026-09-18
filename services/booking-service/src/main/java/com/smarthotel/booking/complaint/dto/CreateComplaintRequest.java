package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.ComplaintIssueType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateComplaintRequest(
        @NotNull UUID bookingId,
        @NotNull ComplaintIssueType issueType,
        @NotBlank @Size(max = 180) String title,
        @NotBlank @Size(max = 5000) String description,
        @DecimalMin(value = "0.01") BigDecimal disputedAmount
) {}
