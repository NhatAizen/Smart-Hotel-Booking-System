package com.smarthotel.hotel.room.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectRoomRequest(

        @NotBlank(message = "Lý do từ chối không được để trống")
        @Size(
                max = 500,
                message = "Lý do từ chối tối đa 500 ký tự"
        )
        String reason

) {
}