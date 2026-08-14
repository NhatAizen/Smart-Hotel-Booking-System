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
@Table(name = "payment_orders")
public class PaymentOrder {

    protected PaymentOrder() {
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "order_code", nullable = false, unique = true)
    private Long orderCode;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", nullable = false, length = 30)
    private PaymentType paymentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private PaymentMethod method;

    @Column(name = "amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PaymentOrderStatus status;

    @Column(name = "description", nullable = false, length = 50)
    private String description;

    @Column(name = "payment_link_id", length = 120)
    private String paymentLinkId;

    @Column(name = "checkout_url", length = 1000)
    private String checkoutUrl;

    @Column(name = "qr_code", columnDefinition = "TEXT")
    private String qrCode;

    @Column(name = "provider_status", length = 50)
    private String providerStatus;

    @Column(name = "provider_reference", length = 150)
    private String providerReference;

    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    @Column(name = "wallet_applied", nullable = false)
    private boolean walletApplied;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PaymentOrder(
            Long orderCode,
            UUID customerId,
            PaymentType paymentType,
            BigDecimal amount,
            String description,
            Instant expiresAt
    ) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.orderCode = orderCode;
        this.customerId = customerId;
        this.paymentType = paymentType;
        this.method = PaymentMethod.PAYOS;
        this.amount = money(amount);
        this.description = description;
        this.expiresAt = expiresAt;
        this.status = PaymentOrderStatus.PENDING;
        this.walletApplied = false;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void attachPaymentLink(
            String paymentLinkId,
            String checkoutUrl,
            String qrCode,
            String providerStatus
    ) {
        this.paymentLinkId = paymentLinkId;
        this.checkoutUrl = checkoutUrl;
        this.qrCode = qrCode;
        this.providerStatus = providerStatus;
        this.failureReason = null;
        this.updatedAt = Instant.now();
    }

    public void markProcessing() {
        if (status == PaymentOrderStatus.PAID) {
            return;
        }
        this.status = PaymentOrderStatus.PROCESSING;
        this.updatedAt = Instant.now();
    }

    public void markPaid(String providerReference, String providerStatus) {
        if (status == PaymentOrderStatus.PAID) {
            return;
        }
        this.providerReference = providerReference;
        this.providerStatus = providerStatus;
        this.status = PaymentOrderStatus.PAID;
        this.failureReason = null;
        this.paidAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markCancelled(String reason, String providerStatus) {
        if (status == PaymentOrderStatus.PAID) {
            throw new IllegalStateException("Không thể hủy giao dịch đã thanh toán");
        }
        this.status = PaymentOrderStatus.CANCELLED;
        this.providerStatus = providerStatus;
        this.failureReason = reason;
        this.cancelledAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markExpired() {
        if (status == PaymentOrderStatus.PAID) {
            return;
        }
        this.status = PaymentOrderStatus.EXPIRED;
        this.providerStatus = "EXPIRED";
        this.failureReason = "Link thanh toán đã hết hạn";
        this.updatedAt = Instant.now();
    }

    public void markFailed(String reason) {
        if (status == PaymentOrderStatus.PAID) {
            return;
        }
        this.status = PaymentOrderStatus.FAILED;
        this.failureReason = reason;
        this.updatedAt = Instant.now();
    }

    public void markWalletApplied() {
        this.walletApplied = true;
        this.updatedAt = Instant.now();
    }

    public boolean isReusable() {
        return (status == PaymentOrderStatus.PENDING || status == PaymentOrderStatus.PROCESSING)
                && (expiresAt == null || Instant.now().isBefore(expiresAt))
                && checkoutUrl != null
                && !checkoutUrl.isBlank();
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public UUID getId() { return id; }
    public Long getOrderCode() { return orderCode; }
    public UUID getCustomerId() { return customerId; }
    public PaymentType getPaymentType() { return paymentType; }
    public PaymentMethod getMethod() { return method; }
    public BigDecimal getAmount() { return amount; }
    public PaymentOrderStatus getStatus() { return status; }
    public String getDescription() { return description; }
    public String getPaymentLinkId() { return paymentLinkId; }
    public String getCheckoutUrl() { return checkoutUrl; }
    public String getQrCode() { return qrCode; }
    public String getProviderStatus() { return providerStatus; }
    public String getProviderReference() { return providerReference; }
    public String getFailureReason() { return failureReason; }
    public boolean isWalletApplied() { return walletApplied; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getPaidAt() { return paidAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
