package com.smarthotel.payment.common.exception;

import java.util.UUID;

public class PaymentNotFoundException extends RuntimeException {

    public PaymentNotFoundException(UUID paymentId) {
        super("Payment not found with ID: " + paymentId);
    }
}