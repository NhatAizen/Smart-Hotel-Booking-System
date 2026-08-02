package com.smarthotel.identity.common.exception;

public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException() {
        super("Email hoặc mật khẩu không chính xác");
    }
}