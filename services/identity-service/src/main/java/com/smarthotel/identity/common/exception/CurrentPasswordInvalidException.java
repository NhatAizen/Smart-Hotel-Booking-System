package com.smarthotel.identity.common.exception;

public class CurrentPasswordInvalidException
        extends RuntimeException {

    public CurrentPasswordInvalidException() {
        super("Mật khẩu hiện tại không chính xác");
    }
}