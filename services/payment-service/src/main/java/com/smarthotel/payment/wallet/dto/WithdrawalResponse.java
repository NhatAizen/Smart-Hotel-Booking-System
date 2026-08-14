package com.smarthotel.payment.wallet.dto;

import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WithdrawalPayoutMethod;
import com.smarthotel.payment.wallet.entity.WithdrawalRequest;
import com.smarthotel.payment.wallet.entity.WithdrawalStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record WithdrawalResponse(
        UUID id,
        UUID walletId,
        UUID ownerId,
        WalletOwnerType ownerType,
        UUID hotelOwnerId,
        BigDecimal amount,
        WithdrawalPayoutMethod payoutMethod,
        String bankName,
        String bankBin,
        String accountNumber,
        String accountName,
        boolean receiverQrAvailable,
        String receiverQrFileName,
        boolean transferProofAvailable,
        String transferProofFileName,
        WithdrawalStatus status,
        UUID reviewedBy,
        UUID paidBy,
        String reviewNote,
        String payoutId,
        String payoutReference,
        String failureReason,
        Instant requestedAt,
        Instant reviewedAt,
        Instant paidAt,
        Instant updatedAt
) {
    public static WithdrawalResponse from(WithdrawalRequest w) {
        return map(w, true);
    }

    public static WithdrawalResponse fromAdmin(WithdrawalRequest w) {
        return map(w, false);
    }

    private static WithdrawalResponse map(WithdrawalRequest w, boolean maskAccount) {
        return new WithdrawalResponse(
                w.getId(), w.getWalletId(), w.getOwnerId(), w.getOwnerType(),
                w.getOwnerType() == WalletOwnerType.HOTEL_ADMIN ? w.getOwnerId() : null,
                w.getAmount(), w.getPayoutMethod(),
                w.getBankName(), w.getBankBin(),
                maskAccount ? mask(w.getAccountNumber()) : w.getAccountNumber(),
                w.getAccountName(),
                w.hasReceiverQr(), w.getReceiverQrFileName(),
                w.hasTransferProof(), w.getTransferProofFileName(),
                w.getStatus(), w.getReviewedBy(), w.getPaidBy(), w.getReviewNote(),
                w.getPayoutId(), w.getPayoutReference(), w.getFailureReason(), w.getRequestedAt(),
                w.getReviewedAt(), w.getPaidAt(), w.getUpdatedAt()
        );
    }

    private static String mask(String value) {
        if (value == null || value.length() <= 4) return value;
        return "*".repeat(value.length() - 4) + value.substring(value.length() - 4);
    }
}
