package com.smarthotel.hotel.roomtype.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Set;

public record CreateRoomTypeRequest(
        @NotBlank(message = "Tên loại phòng không được để trống")
        @Size(max = 120, message = "Tên loại phòng tối đa 120 ký tự")
        String name,

        @Size(max = 5000, message = "Mô tả tối đa 5000 ký tự")
        String description,

        @NotNull(message = "Giá phòng không được để trống")
        @DecimalMin(value = "0.0", inclusive = true, message = "Giá phòng phải lớn hơn hoặc bằng 0")
        BigDecimal basePrice,

        @NotNull(message = "Số người lớn tối đa không được để trống")
        @Min(value = 1, message = "Số người lớn tối đa phải từ 1")
        Integer maxAdults,

        @NotNull(message = "Số trẻ em tối đa không được để trống")
        @Min(value = 0, message = "Số trẻ em tối đa phải từ 0")
        Integer maxChildren,

        @Size(max = 80, message = "Loại giường tối đa 80 ký tự")
        String bedType,

        @NotNull(message = "Số giường không được để trống")
        @Min(value = 1, message = "Số giường phải từ 1")
        Integer bedCount,

        @NotNull(message = "Diện tích không được để trống")
        @DecimalMin(value = "0.01", message = "Diện tích phải lớn hơn 0")
        BigDecimal areaSqm,

        boolean breakfastIncluded,
        boolean refundable,
        boolean smokingAllowed,
        boolean payAtHotelAllowed,
        boolean depositAllowed,

        @NotNull(message = "Tỷ lệ đặt cọc không được để trống")
        @Min(value = 1, message = "Tỷ lệ đặt cọc tối thiểu là 1%")
        @Max(value = 99, message = "Tỷ lệ đặt cọc tối đa là 99%")
        Integer depositPercent,

        boolean fullPaymentAllowed,

        @Size(max = 50, message = "Tối đa 50 tiện nghi")
        Set<@Size(max = 100, message = "Tên tiện nghi tối đa 100 ký tự") String> amenities

) {
}
