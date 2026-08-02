package com.smarthotel.hotel.common.exception;

import java.util.UUID;

public class RoomTypeNotFoundException extends RuntimeException {

    public RoomTypeNotFoundException(UUID roomTypeId) {
        super("Không tìm thấy loại phòng với ID: " + roomTypeId);
    }
}
