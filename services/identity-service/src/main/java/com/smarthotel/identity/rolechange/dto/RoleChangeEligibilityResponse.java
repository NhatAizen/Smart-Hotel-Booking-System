package com.smarthotel.identity.rolechange.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record RoleChangeEligibilityResponse(
        boolean eligible,
        List<UUID> hotelIds,
        long totalHotels,
        long activeHotels,
        long currentStayCount,
        long actionableBookingCount,
        long pendingWithdrawalCount,
        long financialIssueCount,
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
