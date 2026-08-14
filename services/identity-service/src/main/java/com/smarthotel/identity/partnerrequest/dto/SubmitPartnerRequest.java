package com.smarthotel.identity.partnerrequest.dto;

import com.smarthotel.identity.partnerrequest.entity.PartnerApplicantType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record SubmitPartnerRequest(
        @NotNull(message = "Loại đối tác không được để trống")
        PartnerApplicantType applicantType,

        @NotBlank(message = "Họ tên hoặc tên doanh nghiệp không được để trống")
        @Size(max = 150, message = "Tên tối đa 150 ký tự")
        String legalName,

        @NotBlank(message = "Họ tên chủ hồ sơ/người đại diện không được để trống")
        @Size(max = 150, message = "Họ tên người đại diện tối đa 150 ký tự")
        String representativeName,

        @NotBlank(message = "Số CCCD không được để trống")
        @Pattern(regexp = "\\d{12}", message = "CCCD phải gồm đúng 12 chữ số")
        String identityNumber,

        @NotNull(message = "Ngày sinh không được để trống")
        LocalDate dateOfBirth,

        @NotBlank(message = "Số điện thoại liên hệ không được để trống")
        @Size(max = 30, message = "Số điện thoại tối đa 30 ký tự")
        String businessPhone,

        @NotBlank(message = "Địa chỉ liên hệ không được để trống")
        @Size(max = 255, message = "Địa chỉ tối đa 255 ký tự")
        String businessAddress,

        @Size(max = 1000, message = "Ghi chú tối đa 1000 ký tự")
        String note
) {
}
