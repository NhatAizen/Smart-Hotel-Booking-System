package com.smarthotel.booking.policy.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdatePlatformPolicyRequest(
        @NotNull(message = "Độ tuổi tối thiểu không được để trống")
        @Min(value = 16, message = "Độ tuổi tối thiểu không được nhỏ hơn 16")
        @Max(value = 25, message = "Độ tuổi tối thiểu không được lớn hơn 25")
        Integer minimumBookingAge
) {
}
