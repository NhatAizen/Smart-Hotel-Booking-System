package com.smarthotel.identity.common.exception;

public class MailDeliveryException extends RuntimeException {

    public MailDeliveryException(Throwable cause) {
        super("KhÃ´ng thá»ƒ gá»­i email vÃ o lÃºc nÃ y", cause);
    }
}