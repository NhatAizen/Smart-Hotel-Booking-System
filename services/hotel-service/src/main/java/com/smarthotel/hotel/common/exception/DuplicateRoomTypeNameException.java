package com.smarthotel.hotel.common.exception;

public class DuplicateRoomTypeNameException extends RuntimeException {

    public DuplicateRoomTypeNameException(String name) {
        super("Tên loại phòng đã tồn tại trong khách sạn: " + name);
    }
}
