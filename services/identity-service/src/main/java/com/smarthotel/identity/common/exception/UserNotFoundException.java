package com.smarthotel.identity.common.exception;

public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException() {
        super("Không tìm thấy người dùng");
    }
}