package com.smarthotel.notification.common.exception;

public class MailDeliveryException extends RuntimeException {

    public MailDeliveryException(Throwable cause) {
        super("Email delivery failed", cause);
    }
}