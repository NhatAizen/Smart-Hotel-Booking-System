package com.smarthotel.payment.common.exception;

public class DuplicateTransactionCodeException extends RuntimeException {

    public DuplicateTransactionCodeException(String transactionCode) {
        super("Transaction code already exists: " + transactionCode);
    }
}