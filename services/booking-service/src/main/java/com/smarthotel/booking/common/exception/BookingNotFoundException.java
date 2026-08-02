package com.smarthotel.booking.common.exception;

import java.util.UUID;

public class BookingNotFoundException extends RuntimeException {

    public BookingNotFoundException(UUID bookingId) {
        super("Không tìm thấy booking với ID: " + bookingId);
    }
}