package com.smarthotel.booking.common.exception;

public class RoomAlreadyBookedException extends RuntimeException {

    public RoomAlreadyBookedException() {
        super("Phòng đã có booking trùng khoảng thời gian này");
    }
}