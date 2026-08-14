package com.smarthotel.hotel.room.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record BatchCreateRoomsRequest(
        @NotEmpty(message = "Danh sách phòng không được để trống")
        @Size(max = 200, message = "Mỗi lần chỉ được thêm tối đa 200 phòng")
        List<@Valid CreateRoomRequest> rooms
) {
}
