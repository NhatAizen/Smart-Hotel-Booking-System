package com.smarthotel.identity.common.exception;

public class InvalidRefreshTokenException extends RuntimeException {

    public InvalidRefreshTokenException() {
        super("Refresh token không hợp lệ hoặc đã hết hạn");
    }
}