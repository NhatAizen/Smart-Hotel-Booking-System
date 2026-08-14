package com.smarthotel.booking.booking.dto;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateRoomHoldRequest(
        @NotNull(message = "Hotel ID không được để trống")
        UUID hotelId,

        @NotEmpty(message = "Phải chọn ít nhất một phòng")
        @Size(max = 10, message = "Mỗi lần chỉ được giữ tối đa 10 phòng")
        List<@NotNull UUID> roomIds,

        @NotNull(message = "Ngày nhận phòng không được để trống")
        @FutureOrPresent(message = "Ngày nhận phòng không được ở quá khứ")
        LocalDate checkIn,

        @NotNull(message = "Ngày trả phòng không được để trống")
        LocalDate checkOut,

        UUID holdToken
) {
}
