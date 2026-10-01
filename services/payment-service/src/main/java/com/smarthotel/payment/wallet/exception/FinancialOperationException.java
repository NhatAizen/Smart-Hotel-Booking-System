package com.smarthotel.payment.wallet.exception;

import org.springframework.http.HttpStatus;

public class FinancialOperationException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    public FinancialOperationException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public String getCode() { return code; }
    public HttpStatus getStatus() { return status; }
}
