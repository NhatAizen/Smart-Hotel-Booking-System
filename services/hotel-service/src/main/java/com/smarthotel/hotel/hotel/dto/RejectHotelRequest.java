package com.smarthotel.hotel.hotel.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectHotelRequest(

        @NotBlank(message = "Lý do từ chối không được để trống")
        @Size(max = 500, message = "Lý do tối đa 500 ký tự")
        String reason

) {
}