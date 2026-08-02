package com.smarthotel.hotel.common.exception;

public class DuplicateRoomNumberException extends RuntimeException {

    public DuplicateRoomNumberException(String roomNumber) {
        super("Số phòng đã tồn tại trong khách sạn: " + roomNumber);
    }
}
