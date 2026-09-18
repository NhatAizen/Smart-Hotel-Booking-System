package com.smarthotel.identity.partnerrequest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectPartnerRequest(

        @NotBlank(
                message = "Lý do xử lý không được để trống"
        )
        @Size(
                max = 500,
                message = "Lý do xử lý tối đa 500 ký tự"
        )
        String reason

) {
}
