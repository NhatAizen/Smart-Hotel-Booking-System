package com.smarthotel.payment.wallet.entity;

public enum WithdrawalPayoutMethod {
    BANK_ACCOUNT,
    PERSONAL_QR,
    BANK_AND_QR;

    public boolean requiresBankAccount() {
        return this == BANK_ACCOUNT || this == BANK_AND_QR;
    }

    public boolean requiresQr() {
        return this == PERSONAL_QR || this == BANK_AND_QR;
    }
}
