package com.smarthotel.hotel.room.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateRoomRequest(

        @NotNull(message = "Room Type ID không được để trống")
        UUID roomTypeId,

        @NotBlank(message = "Số phòng không được để trống")
        @Size(max = 40, message = "Số phòng tối đa 40 ký tự")
        String roomNumber,

        Integer floor,

        @DecimalMin(value = "0.0", inclusive = true, message = "Giá riêng phải lớn hơn hoặc bằng 0")
        BigDecimal customPrice,

        @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
        String note

) {
}
