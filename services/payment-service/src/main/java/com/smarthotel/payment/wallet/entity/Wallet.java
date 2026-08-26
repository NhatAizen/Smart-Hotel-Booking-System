package com.smarthotel.payment.wallet.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallets", uniqueConstraints = @UniqueConstraint(
        name = "uq_wallets_owner", columnNames = {"owner_type", "owner_id"}
))
public class Wallet {

    public static final UUID PLATFORM_OWNER_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    protected Wallet() {}

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "owner_type", nullable = false, length = 30)
    private WalletOwnerType ownerType;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "available_balance", nullable = false, precision = 16, scale = 2)
    private BigDecimal availableBalance;

    @Column(name = "pending_balance", nullable = false, precision = 16, scale = 2)
    private BigDecimal pendingBalance;

    @Column(name = "locked_balance", nullable = false, precision = 16, scale = 2)
    private BigDecimal lockedBalance;

    @Column(name = "commission_debt", nullable = false, precision = 16, scale = 2)
    private BigDecimal commissionDebt;

    @Column(name = "total_earned", nullable = false, precision = 16, scale = 2)
    private BigDecimal totalEarned;

    @Column(name = "total_withdrawn", nullable = false, precision = 16, scale = 2)
    private BigDecimal totalWithdrawn;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Wallet(WalletOwnerType ownerType, UUID ownerId) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.ownerType = ownerType;
        this.ownerId = ownerId;
        this.availableBalance = zero();
        this.pendingBalance = zero();
        this.lockedBalance = zero();
        this.commissionDebt = zero();
        this.totalEarned = zero();
        this.totalWithdrawn = zero();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void creditAvailable(BigDecimal amount) {
        BigDecimal value = positive(amount);
        availableBalance = money(availableBalance.add(value));
        totalEarned = money(totalEarned.add(value));
        updatedAt = Instant.now();
    }

    public BigDecimal topUpAvailable(BigDecimal amount) {
        BigDecimal value = positive(amount);
        availableBalance = money(availableBalance.add(value));
        BigDecimal debtSettled = settleCommissionDebtFromAvailable();
        updatedAt = Instant.now();
        return debtSettled;
    }

    public void creditCustomerRefund(BigDecimal amount) {
        BigDecimal value = positive(amount);
        availableBalance = money(availableBalance.add(value));
        updatedAt = Instant.now();
    }

    public void spendAvailable(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(availableBalance, value, "Số dư ví không đủ");
        availableBalance = money(availableBalance.subtract(value));
        updatedAt = Instant.now();
    }

    public CommissionCharge chargeCommission(BigDecimal amount) {
        BigDecimal value = positive(amount);

        /*
         * Commission của CASH không được phép ăn vào pendingBalance của
         * booking online khác. Available được dùng trước, phần thiếu chuyển
         * thành commissionDebt để cấn trừ ở lần release/top-up sau.
         */
        BigDecimal debitedFromAvailable = availableBalance.min(value);
        availableBalance = money(availableBalance.subtract(debitedFromAvailable));

        BigDecimal debtAdded = money(value.subtract(debitedFromAvailable));
        if (debtAdded.signum() > 0) {
            commissionDebt = money(commissionDebt.add(debtAdded));
        }

        updatedAt = Instant.now();
        return new CommissionCharge(debitedFromAvailable, debtAdded);
    }

    public BigDecimal settleCommissionDebtFromAvailable() {
        if (commissionDebt.signum() <= 0 || availableBalance.signum() <= 0) {
            return zero();
        }

        BigDecimal settled = availableBalance.min(commissionDebt);
        availableBalance = money(availableBalance.subtract(settled));
        commissionDebt = money(commissionDebt.subtract(settled));
        updatedAt = Instant.now();
        return settled;
    }

    public ReleaseResult releasePendingAndSettleCommissionDebt(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(pendingBalance, value, "Số dư đang giữ không đủ");

        pendingBalance = money(pendingBalance.subtract(value));

        BigDecimal debtSettled = value.min(commissionDebt);
        if (debtSettled.signum() > 0) {
            commissionDebt = money(commissionDebt.subtract(debtSettled));
        }

        BigDecimal creditedAvailable = money(value.subtract(debtSettled));
        if (creditedAvailable.signum() > 0) {
            availableBalance = money(availableBalance.add(creditedAvailable));
        }

        updatedAt = Instant.now();
        return new ReleaseResult(creditedAvailable, debtSettled);
    }

    public void recordExternalRevenue(BigDecimal amount) {
        BigDecimal value = positive(amount);
        totalEarned = money(totalEarned.add(value));
        updatedAt = Instant.now();
    }

    public void debitForRefund(BigDecimal amount) {
        BigDecimal value = positive(amount);
        BigDecimal totalUsable = money(availableBalance.add(pendingBalance));
        ensureAtLeast(totalUsable, value,
                "Số dư đối tác không đủ để hoàn tiền. Cần bổ sung số dư trước khi hoàn.");

        BigDecimal fromPending = pendingBalance.min(value);
        pendingBalance = money(pendingBalance.subtract(fromPending));
        BigDecimal remaining = money(value.subtract(fromPending));
        if (remaining.signum() > 0) {
            availableBalance = money(availableBalance.subtract(remaining));
        }
        totalEarned = money(totalEarned.subtract(value).max(BigDecimal.ZERO));
        updatedAt = Instant.now();
    }

    public void creditPending(BigDecimal amount) {
        BigDecimal value = positive(amount);
        pendingBalance = money(pendingBalance.add(value));
        totalEarned = money(totalEarned.add(value));
        updatedAt = Instant.now();
    }

    public void releasePending(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(pendingBalance, value, "Số dư đang giữ không đủ");
        pendingBalance = money(pendingBalance.subtract(value));
        availableBalance = money(availableBalance.add(value));
        updatedAt = Instant.now();
    }


    public void debitAvailable(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(availableBalance, value, "Số dư khả dụng không đủ để hoàn tiền");
        availableBalance = money(availableBalance.subtract(value));
        totalEarned = money(totalEarned.subtract(value).max(BigDecimal.ZERO));
        updatedAt = Instant.now();
    }

    public void debitPending(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(pendingBalance, value, "Số dư đang giữ không đủ để hoàn tiền");
        pendingBalance = money(pendingBalance.subtract(value));
        totalEarned = money(totalEarned.subtract(value).max(BigDecimal.ZERO));
        updatedAt = Instant.now();
    }

    public void holdForWithdrawal(BigDecimal amount) {
        BigDecimal value = positive(amount);
        if (commissionDebt.signum() > 0) {
            throw new IllegalStateException(
                    "Ví đối tác còn công nợ hoa hồng "
                            + commissionDebt.toPlainString()
                            + " đ. Hệ thống phải cấn trừ công nợ trước khi rút tiền."
            );
        }
        ensureAtLeast(availableBalance, value, "Số dư khả dụng không đủ");
        availableBalance = money(availableBalance.subtract(value));
        lockedBalance = money(lockedBalance.add(value));
        updatedAt = Instant.now();
    }

    public void releaseWithdrawalHold(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(lockedBalance, value, "Số dư khóa không đủ");
        lockedBalance = money(lockedBalance.subtract(value));
        availableBalance = money(availableBalance.add(value));
        updatedAt = Instant.now();
    }

    public void completeWithdrawal(BigDecimal amount) {
        BigDecimal value = positive(amount);
        ensureAtLeast(lockedBalance, value, "Số dư khóa không đủ");
        lockedBalance = money(lockedBalance.subtract(value));
        totalWithdrawn = money(totalWithdrawn.add(value));
        updatedAt = Instant.now();
    }

    private static BigDecimal positive(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("Số tiền phải lớn hơn 0");
        }
        return money(amount);
    }

    private static void ensureAtLeast(BigDecimal balance, BigDecimal amount, String message) {
        if (balance.compareTo(amount) < 0) throw new IllegalStateException(message);
    }

    private static BigDecimal zero() { return BigDecimal.ZERO.setScale(0, RoundingMode.HALF_UP); }
    private static BigDecimal money(BigDecimal value) { return value.setScale(0, RoundingMode.HALF_UP); }

    public UUID getId() { return id; }
    public WalletOwnerType getOwnerType() { return ownerType; }
    public UUID getOwnerId() { return ownerId; }
    public BigDecimal getAvailableBalance() { return availableBalance; }
    public BigDecimal getPendingBalance() { return pendingBalance; }
    public BigDecimal getLockedBalance() { return lockedBalance; }
    public BigDecimal getCommissionDebt() { return commissionDebt; }
    public BigDecimal getTotalEarned() { return totalEarned; }
    public BigDecimal getTotalWithdrawn() { return totalWithdrawn; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public record CommissionCharge(
            BigDecimal debitedFromAvailable,
            BigDecimal debtAdded
    ) {}

    public record ReleaseResult(
            BigDecimal creditedAvailable,
            BigDecimal debtSettled
    ) {}
}
