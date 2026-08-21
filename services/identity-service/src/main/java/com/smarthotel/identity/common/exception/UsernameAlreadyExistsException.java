package com.smarthotel.identity.common.exception;

public class UsernameAlreadyExistsException extends RuntimeException {
    public UsernameAlreadyExistsException(String username) {
        super("Tên đăng nhập '" + username + "' đã được sử dụng");
    }
}
