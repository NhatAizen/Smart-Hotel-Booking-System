package com.smarthotel.payment.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payments")
public class Payment {

    protected Payment() {
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "payment_order_id")
    private UUID paymentOrderId;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "hotel_id")
    private UUID hotelId;

    @Column(name = "hotel_owner_id")
    private UUID hotelOwnerId;

    @Column(name = "amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private PaymentMethod method;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", nullable = false, length = 30)
    private PaymentType paymentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PaymentStatus status;

    @Column(name = "commission_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal commissionRate;

    @Column(name = "commission_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal commissionAmount;

    @Column(name = "hotel_net_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal hotelNetAmount;

    @Column(name = "booking_applied", nullable = false)
    private boolean bookingApplied;

    @Column(name = "wallet_applied", nullable = false)
    private boolean walletApplied;

    @Column(name = "revenue_released", nullable = false)
    private boolean revenueReleased;

    @Column(name = "transaction_code", length = 120)
    private String transactionCode;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "refunded_at")
    private Instant refundedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Payment(
            UUID paymentOrderId,
            UUID bookingId,
            UUID customerId,
            UUID hotelId,
            UUID hotelOwnerId,
            BigDecimal amount,
            PaymentMethod method,
            PaymentType paymentType,
            BigDecimal commissionRate
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.paymentOrderId = paymentOrderId;
        this.bookingId = bookingId;
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.hotelOwnerId = hotelOwnerId;
        this.amount = money(amount);
        this.method = method;
        this.paymentType = paymentType;
        this.status = PaymentStatus.PENDING;
        this.commissionRate = moneyRate(commissionRate);

        // VND không có đơn vị thập phân trong đối soát thực tế. Payment.amount vẫn
        // giữ scale=2 để tương thích Booking Service, nhưng phần tiền thực tế được
        // hạch toán cho platform/hotel phải dựa trên số VND nguyên mà PayOS/tiền mặt thu.
        BigDecimal settlementAmount = wholeDong(this.amount);
        this.commissionAmount = wholeDong(
                settlementAmount.multiply(this.commissionRate)
                        .divide(BigDecimal.valueOf(100), 8, RoundingMode.HALF_UP)
        );
        this.hotelNetAmount = settlementAmount.subtract(this.commissionAmount);
        this.bookingApplied = false;
        this.walletApplied = false;
        this.revenueReleased = false;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public Payment(
            UUID bookingId,
            UUID customerId,
            BigDecimal amount,
            PaymentMethod method,
            PaymentType paymentType
    ) {
        this(
                null,
                bookingId,
                customerId,
                null,
                null,
                amount,
                method,
                paymentType,
                BigDecimal.ZERO
        );
    }

    public void markBookingApplied() {
        this.bookingApplied = true;
        this.updatedAt = Instant.now();
    }

    public void markWalletApplied() {
        this.walletApplied = true;
        this.updatedAt = Instant.now();
    }

    public void markRevenueReleased() {
        this.revenueReleased = true;
        this.updatedAt = Instant.now();
    }

    public void markPaid(String transactionCode) {
        if (status == PaymentStatus.PAID) {
            return;
        }
        if (status != PaymentStatus.PENDING) {
            throw new IllegalStateException("Chỉ giao dịch PENDING mới có thể hoàn tất");
        }
        this.transactionCode = transactionCode;
        this.status = PaymentStatus.PAID;
        this.failureReason = null;
        this.paidAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markFailed(String failureReason) {
        if (status == PaymentStatus.PAID || status == PaymentStatus.REFUNDED) {
            return;
        }
        this.status = PaymentStatus.FAILED;
        this.failureReason = failureReason;
        this.updatedAt = Instant.now();
    }

    public void markCancelled(String reason) {
        if (status == PaymentStatus.PAID || status == PaymentStatus.REFUNDED) {
            return;
        }
        this.status = PaymentStatus.CANCELLED;
        this.failureReason = reason;
        this.updatedAt = Instant.now();
    }

    public void markExpired() {
        if (status == PaymentStatus.PAID || status == PaymentStatus.REFUNDED) {
            return;
        }
        this.status = PaymentStatus.EXPIRED;
        this.failureReason = "Link thanh toán đã hết hạn";
        this.updatedAt = Instant.now();
    }

    public void refund() {
        if (status != PaymentStatus.PAID) {
            throw new IllegalStateException("Chỉ giao dịch PAID mới có thể hoàn tiền");
        }
        this.status = PaymentStatus.REFUNDED;
        this.refundedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal wholeDong(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(0, RoundingMode.HALF_UP);
        }
        return value.setScale(0, RoundingMode.HALF_UP);
    }

    private static BigDecimal moneyRate(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public UUID getId() { return id; }
    public UUID getPaymentOrderId() { return paymentOrderId; }
    public UUID getBookingId() { return bookingId; }
    public UUID getCustomerId() { return customerId; }
    public UUID getHotelId() { return hotelId; }
    public UUID getHotelOwnerId() { return hotelOwnerId; }
    public BigDecimal getAmount() { return amount; }
    public PaymentMethod getMethod() { return method; }
    public PaymentType getPaymentType() { return paymentType; }
    public PaymentStatus getStatus() { return status; }
    public BigDecimal getCommissionRate() { return commissionRate; }
    public BigDecimal getCommissionAmount() { return commissionAmount; }
    public BigDecimal getHotelNetAmount() { return hotelNetAmount; }
    public boolean isBookingApplied() { return bookingApplied; }
    public boolean isWalletApplied() { return walletApplied; }
    public boolean isRevenueReleased() { return revenueReleased; }
    public String getTransactionCode() { return transactionCode; }
    public String getFailureReason() { return failureReason; }
    public Instant getPaidAt() { return paidAt; }
    public Instant getRefundedAt() { return refundedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
