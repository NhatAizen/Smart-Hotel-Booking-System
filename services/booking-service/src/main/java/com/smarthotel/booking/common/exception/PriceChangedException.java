package com.smarthotel.booking.common.exception;

public class PriceChangedException extends RuntimeException {
    public PriceChangedException() {
        super("Giá phòng đã thay đổi. Vui lòng kiểm tra báo giá mới và xác nhận lại.");
    }
}
