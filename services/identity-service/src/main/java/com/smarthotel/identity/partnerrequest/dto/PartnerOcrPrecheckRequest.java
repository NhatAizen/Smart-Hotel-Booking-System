package com.smarthotel.identity.partnerrequest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record PartnerOcrPrecheckRequest(
        @NotBlank(message = "Số CCCD không được để trống")
        @Pattern(regexp = "\\d{12}", message = "CCCD phải gồm đúng 12 chữ số")
        String identityNumber,

        @NotBlank(message = "Họ tên trên CCCD không được để trống")
        @Size(max = 150, message = "Họ tên tối đa 150 ký tự")
        String fullName,

        @NotNull(message = "Ngày sinh không được để trống")
        LocalDate dateOfBirth
) {
}
