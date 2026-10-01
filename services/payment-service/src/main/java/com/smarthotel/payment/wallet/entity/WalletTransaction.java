package com.smarthotel.payment.wallet.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallet_transactions")
public class WalletTransaction {
    protected WalletTransaction() {}

    @Id @Column(nullable = false, updatable = false)
    private UUID id;
    @Column(name = "wallet_id", nullable = false)
    private UUID walletId;
    @Column(name = "payment_id")
    private UUID paymentId;
    @Column(name = "payment_order_id")
    private UUID paymentOrderId;
    @Column(name = "withdrawal_id")
    private UUID withdrawalId;
    @Column(name = "transfer_id")
    private UUID transferId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private WalletTransactionType type;
    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount;
    @Column(nullable = false, length = 500)
    private String description;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "balance_before", precision = 16, scale = 2)
    private BigDecimal balanceBefore;
    @Column(name = "balance_after", precision = 16, scale = 2)
    private BigDecimal balanceAfter;
    @Column(name = "reference_type", length = 60)
    private String referenceType;
    @Column(name = "reference_id", length = 160)
    private String referenceId;
    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;
    @Column(name = "actor_type", length = 40)
    private String actorType;
    @Column(name = "actor_id")
    private UUID actorId;

    public WalletTransaction(UUID walletId, UUID paymentId, UUID withdrawalId,
                             WalletTransactionType type, BigDecimal amount, String description) {
        this.id = UUID.randomUUID();
        this.walletId = walletId;
        this.paymentId = paymentId;
        this.paymentOrderId = null;
        this.withdrawalId = withdrawalId;
        this.transferId = null;
        this.type = type;
        this.amount = amount.setScale(0, RoundingMode.HALF_UP);
        this.description = description;
        this.createdAt = Instant.now();
    }

    public static WalletTransaction forTopUp(UUID walletId, UUID paymentOrderId,
                                             BigDecimal amount, String description) {
        WalletTransaction transaction = new WalletTransaction(
                walletId, null, null, WalletTransactionType.WALLET_TOP_UP, amount, description
        );
        transaction.paymentOrderId = paymentOrderId;
        return transaction;
    }

    public static WalletTransaction forHotelCustomerTransfer(
            UUID walletId, UUID transferId, WalletTransactionType type,
            BigDecimal amount, String description
    ) {
        if (transferId == null || (type != WalletTransactionType.HOTEL_TO_CUSTOMER_DEBIT
                && type != WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT)) {
            throw new IllegalArgumentException("Giao dịch chuyển ví không hợp lệ");
        }
        if (amount == null || (type == WalletTransactionType.HOTEL_TO_CUSTOMER_DEBIT
                && amount.signum() >= 0) || (type == WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT
                && amount.signum() <= 0)) {
            throw new IllegalArgumentException("Dấu của số tiền chuyển ví không hợp lệ");
        }
        WalletTransaction transaction = new WalletTransaction(
                walletId, null, null, type, amount, description
        );
        transaction.transferId = transferId;
        return transaction;
    }

    public static WalletTransaction audited(
            UUID walletId,
            UUID withdrawalId,
            WalletTransactionType type,
            BigDecimal amount,
            String description,
            BigDecimal balanceBefore,
            BigDecimal balanceAfter,
            String referenceType,
            String referenceId,
            String idempotencyKey,
            String actorType,
            UUID actorId
    ) {
        WalletTransaction transaction = new WalletTransaction(
                walletId, null, withdrawalId, type, amount, description
        );
        transaction.balanceBefore = money(balanceBefore);
        transaction.balanceAfter = money(balanceAfter);
        transaction.referenceType = clean(referenceType);
        transaction.referenceId = clean(referenceId);
        transaction.idempotencyKey = clean(idempotencyKey);
        transaction.actorType = clean(actorType);
        transaction.actorId = actorId;
        return transaction;
    }

    private static BigDecimal money(BigDecimal value) {
        return value == null ? null : value.setScale(0, RoundingMode.HALF_UP);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    public UUID getId() { return id; }
    public UUID getWalletId() { return walletId; }
    public UUID getPaymentId() { return paymentId; }
    public UUID getPaymentOrderId() { return paymentOrderId; }
    public UUID getWithdrawalId() { return withdrawalId; }
    public UUID getTransferId() { return transferId; }
    public WalletTransactionType getType() { return type; }
    public BigDecimal getAmount() { return amount; }
    public String getDescription() { return description; }
    public Instant getCreatedAt() { return createdAt; }
    public BigDecimal getBalanceBefore() { return balanceBefore; }
    public BigDecimal getBalanceAfter() { return balanceAfter; }
    public String getReferenceType() { return referenceType; }
    public String getReferenceId() { return referenceId; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getActorType() { return actorType; }
    public UUID getActorId() { return actorId; }
}
