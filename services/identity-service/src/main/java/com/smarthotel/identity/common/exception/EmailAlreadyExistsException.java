package com.smarthotel.identity.common.exception;

public class EmailAlreadyExistsException extends RuntimeException {

    public EmailAlreadyExistsException(String email) {
        super("Email Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng: " + email);
    }
}