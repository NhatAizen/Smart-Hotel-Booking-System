package com.smarthotel.booking.booking.roomchange;

import jakarta.validation.constraints.Size;

public record ApproveRoomChangeRequest(
        @Size(max = 1000, message = "Ghi chú tối đa 1000 ký tự")
        String note
) {
}
