package com.smarthotel.identity.rolechange.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RoleChangeReasonRequest(
        @NotBlank(message = "Lý do không được để trống")
        @Size(max = 500, message = "Lý do tối đa 500 ký tự")
        String reason
) {
}
