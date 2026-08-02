package com.smarthotel.identity.common.exception;

public class MailDeliveryException extends RuntimeException {

    public MailDeliveryException(Throwable cause) {
        super("Không thể gửi email vào lúc này", cause);
    }
}