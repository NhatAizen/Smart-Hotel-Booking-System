package com.smarthotel.hotel.common.exception;

import java.util.UUID;

public class HotelNotFoundException extends RuntimeException {

    public HotelNotFoundException(UUID hotelId) {
        super("Không tìm thấy khách sạn với ID: " + hotelId);
    }
}