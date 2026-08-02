package com.smarthotel.payment.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "payments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payment {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private PaymentMethod method;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PaymentStatus status;

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
            UUID bookingId,
            UUID customerId,
            BigDecimal amount,
            PaymentMethod method
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.customerId = customerId;
        this.amount = amount;
        this.method = method;
        this.status = PaymentStatus.PENDING;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markPaid(String transactionCode) {
        if (status != PaymentStatus.PENDING) {
            throw new IllegalStateException(
                    "Only PENDING payments can be completed"
            );
        }

        this.transactionCode = transactionCode;
        this.status = PaymentStatus.PAID;
        this.failureReason = null;
        this.paidAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markFailed(String failureReason) {
        if (status != PaymentStatus.PENDING) {
            throw new IllegalStateException(
                    "Only PENDING payments can be marked as failed"
            );
        }

        this.status = PaymentStatus.FAILED;
        this.failureReason = failureReason;
        this.updatedAt = Instant.now();
    }

    public void refund() {
        if (status != PaymentStatus.PAID) {
            throw new IllegalStateException(
                    "Only PAID payments can be refunded"
            );
        }

        this.status = PaymentStatus.REFUNDED;
        this.refundedAt = Instant.now();
        this.updatedAt = Instant.now();
    }
}