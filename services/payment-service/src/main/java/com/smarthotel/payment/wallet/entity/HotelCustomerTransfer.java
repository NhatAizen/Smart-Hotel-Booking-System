package com.smarthotel.payment.wallet.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "hotel_customer_transfers")
public class HotelCustomerTransfer {
    protected HotelCustomerTransfer() {}

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false, updatable = false)
    private UUID bookingId;

    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "amount", nullable = false, updatable = false, precision = 16, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private HotelCustomerTransferStatus status;

    @Column(name = "completed_at")
    private Instant completedAt;

    public void complete() {
        if (status != HotelCustomerTransferStatus.RESERVED) {
            throw new IllegalStateException("Giao dịch chuyển ví đã hoàn tất");
        }
        status = HotelCustomerTransferStatus.COMPLETED;
        completedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public UUID getHotelId() { return hotelId; }
    public UUID getCustomerId() { return customerId; }
    public BigDecimal getAmount() { return amount; }
    public HotelCustomerTransferStatus getStatus() { return status; }
    public Instant getCompletedAt() { return completedAt; }
}
