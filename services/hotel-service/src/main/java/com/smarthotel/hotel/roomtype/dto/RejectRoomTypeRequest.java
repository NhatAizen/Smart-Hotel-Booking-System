package com.smarthotel.hotel.roomtype.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectRoomTypeRequest(
        @NotBlank(message = "Lý do từ chối không được để trống")
        @Size(max = 500, message = "Lý do từ chối tối đa 500 ký tự")
        String reason
) {}
