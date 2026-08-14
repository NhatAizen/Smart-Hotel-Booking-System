package com.smarthotel.booking.pricing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "booking_night_prices")
public class BookingNightPrice {
    protected BookingNightPrice() {}

    public BookingNightPrice(
            UUID bookingId,
            LocalDate stayDate,
            BigDecimal basePrice,
            String pricingType,
            String pricingLabel,
            BigDecimal surchargePercent,
            BigDecimal surchargeAmount,
            BigDecimal finalPrice
    ) {
        this.id = UUID.randomUUID();
        this.bookingId = bookingId;
        this.stayDate = stayDate;
        this.basePrice = basePrice;
        this.pricingType = pricingType;
        this.pricingLabel = pricingLabel;
        this.surchargePercent = surchargePercent;
        this.surchargeAmount = surchargeAmount;
        this.finalPrice = finalPrice;
        this.createdAt = Instant.now();
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "stay_date", nullable = false)
    private LocalDate stayDate;

    @Column(name = "base_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal basePrice;

    @Column(name = "pricing_type", nullable = false, length = 30)
    private String pricingType;

    @Column(name = "pricing_label", nullable = false, length = 180)
    private String pricingLabel;

    @Column(name = "surcharge_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal surchargePercent;

    @Column(name = "surcharge_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal surchargeAmount;

    @Column(name = "final_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal finalPrice;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public LocalDate getStayDate() { return stayDate; }
    public BigDecimal getBasePrice() { return basePrice; }
    public String getPricingType() { return pricingType; }
    public String getPricingLabel() { return pricingLabel; }
    public BigDecimal getSurchargePercent() { return surchargePercent; }
    public BigDecimal getSurchargeAmount() { return surchargeAmount; }
    public BigDecimal getFinalPrice() { return finalPrice; }
}
