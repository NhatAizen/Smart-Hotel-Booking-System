package com.smarthotel.booking.booking.roomchange;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateRoomChangeRequest(
        @NotNull(message = "Vui lòng chọn phòng muốn đổi sang")
        UUID targetRoomId,
        @NotBlank(message = "Vui lòng nhập lý do đổi phòng")
        @Size(max = 1000, message = "Lý do đổi phòng tối đa 1000 ký tự")
        String reason
) {
}
