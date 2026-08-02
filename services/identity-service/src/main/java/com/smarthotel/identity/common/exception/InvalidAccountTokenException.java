package com.smarthotel.identity.common.exception;

public class InvalidAccountTokenException
        extends RuntimeException {

    public InvalidAccountTokenException() {
        super("Token không hợp lệ, đã được sử dụng hoặc đã hết hạn");
    }
}