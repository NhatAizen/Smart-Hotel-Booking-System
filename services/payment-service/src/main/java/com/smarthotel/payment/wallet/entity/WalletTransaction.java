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
}
