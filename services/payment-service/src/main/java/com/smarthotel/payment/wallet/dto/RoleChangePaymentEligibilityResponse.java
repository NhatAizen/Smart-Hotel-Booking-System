package com.smarthotel.payment.wallet.dto;

import java.math.BigDecimal;
import java.util.List;

public record RoleChangePaymentEligibilityResponse(
        boolean eligible,
        long openWithdrawalCount,
        BigDecimal availableBalance,
        BigDecimal pendingBalance,
        BigDecimal lockedBalance,
        BigDecimal commissionDebt,
        long pendingPaymentCount,
        long unsettledPaymentCount,
        long openWalletTopUpCount,
        List<String> blockers
) {
}
