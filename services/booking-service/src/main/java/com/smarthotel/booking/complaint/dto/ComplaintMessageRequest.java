package com.smarthotel.booking.complaint.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ComplaintMessageRequest(
        @NotBlank @Size(max = 5000) String message
) {}
