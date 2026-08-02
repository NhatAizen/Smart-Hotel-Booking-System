package com.smarthotel.identity.common.exception;

public class EmailAlreadyExistsException extends RuntimeException {

    public EmailAlreadyExistsException(String email) {
        super("Email đã được sử dụng: " + email);
    }
}