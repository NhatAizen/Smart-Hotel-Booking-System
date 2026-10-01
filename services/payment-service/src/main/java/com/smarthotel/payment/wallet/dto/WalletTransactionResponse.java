package com.smarthotel.payment.wallet.dto;

import com.smarthotel.payment.wallet.entity.WalletTransaction;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record WalletTransactionResponse(UUID id, UUID walletId, UUID paymentId, UUID paymentOrderId,
                                        UUID withdrawalId, WalletTransactionType type, BigDecimal amount,
                                        String description, BigDecimal balanceBefore, BigDecimal balanceAfter,
                                        String referenceType, String referenceId,
                                        String actorType, UUID actorId, Instant createdAt) {
    public static WalletTransactionResponse from(WalletTransaction t) {
        return new WalletTransactionResponse(t.getId(), t.getWalletId(), t.getPaymentId(),
                t.getPaymentOrderId(), t.getWithdrawalId(), t.getType(), t.getAmount(), t.getDescription(),
                t.getBalanceBefore(), t.getBalanceAfter(), t.getReferenceType(), t.getReferenceId(),
                t.getActorType(), t.getActorId(), t.getCreatedAt());
    }
}
