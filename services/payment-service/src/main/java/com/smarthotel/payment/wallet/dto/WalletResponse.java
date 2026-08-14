package com.smarthotel.payment.wallet.dto;

import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record WalletResponse(UUID id, WalletOwnerType ownerType, UUID ownerId,
                             BigDecimal availableBalance, BigDecimal pendingBalance,
                             BigDecimal lockedBalance, BigDecimal commissionDebt,
                             BigDecimal totalEarned,
                             BigDecimal totalWithdrawn, Instant createdAt, Instant updatedAt) {
    public static WalletResponse from(Wallet w) {
        return new WalletResponse(w.getId(), w.getOwnerType(), w.getOwnerId(), w.getAvailableBalance(),
                w.getPendingBalance(), w.getLockedBalance(), w.getCommissionDebt(),
                w.getTotalEarned(), w.getTotalWithdrawn(), w.getCreatedAt(), w.getUpdatedAt());
    }
}
