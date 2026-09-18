package com.smarthotel.hotel.policy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record HotelPolicyRuleRequest(
        @NotBlank(message = "Tiêu đề quy định không được để trống")
        @Size(max = 120, message = "Tiêu đề quy định tối đa 120 ký tự")
        String title,

        @NotBlank(message = "Nội dung quy định không được để trống")
        @Size(max = 1500, message = "Nội dung quy định tối đa 1500 ký tự")
        String content
) {
}
