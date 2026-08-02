package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmailRequest(

        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        String email

) {
}