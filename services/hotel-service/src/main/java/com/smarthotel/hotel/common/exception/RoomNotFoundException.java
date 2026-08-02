package com.smarthotel.hotel.common.exception;

import java.util.UUID;

public class RoomNotFoundException extends RuntimeException {

    public RoomNotFoundException(UUID roomId) {
        super("Không tìm thấy phòng với ID: " + roomId);
    }
}
