package com.smarthotel.identity.partnerrequest.ekyc;

public class PartnerEkycVerificationException extends RuntimeException {

    public PartnerEkycVerificationException(String message) {
        super(message);
    }

    public PartnerEkycVerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
