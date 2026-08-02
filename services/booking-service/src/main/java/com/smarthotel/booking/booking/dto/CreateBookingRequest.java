package com.smarthotel.booking.booking.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateBookingRequest(

        @NotNull(message = "Customer ID không được để trống")
        UUID customerId,

        @NotNull(message = "Hotel ID không được để trống")
        UUID hotelId,

        @NotNull(message = "Room ID không được để trống")
        UUID roomId,

        @NotNull(message = "Ngày nhận phòng không được để trống")
        @FutureOrPresent(message = "Ngày nhận phòng không được ở quá khứ")
        LocalDate checkIn,

        @NotNull(message = "Ngày trả phòng không được để trống")
        LocalDate checkOut,

        @NotNull(message = "Số khách không được để trống")
        @Min(value = 1, message = "Số khách phải từ 1")
        Integer guestCount,

        @NotNull(message = "Tổng tiền không được để trống")
        @DecimalMin(value = "0.0", inclusive = true, message = "Tổng tiền phải lớn hơn hoặc bằng 0")
        BigDecimal totalPrice,

        @Size(max = 1000, message = "Yêu cầu đặc biệt tối đa 1000 ký tự")
        String specialRequest

) {
}