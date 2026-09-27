package com.smarthotel.hotel.pricing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "manual_daily_price_rules")
public class ManualDailyPriceRule {
    protected ManualDailyPriceRule() {}

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @Column(name = "room_type_id", nullable = false, updatable = false)
    private UUID roomTypeId;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "nightly_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal nightlyPrice;

    @Column(name = "approved_base_price_at_save", nullable = false, precision = 12, scale = 2)
    private BigDecimal approvedBasePriceAtSave;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public ManualDailyPriceRule(UUID hotelId, UUID roomTypeId, LocalDate startDate,
                                LocalDate endDate, BigDecimal nightlyPrice,
                                BigDecimal approvedBasePriceAtSave) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.hotelId = hotelId;
        this.roomTypeId = roomTypeId;
        update(startDate, endDate, nightlyPrice, approvedBasePriceAtSave);
        this.createdAt = now;
    }

    public void update(LocalDate startDate, LocalDate endDate, BigDecimal nightlyPrice,
                       BigDecimal approvedBasePriceAtSave) {
        this.startDate = startDate;
        this.endDate = endDate;
        this.nightlyPrice = nightlyPrice;
        this.approvedBasePriceAtSave = approvedBasePriceAtSave;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getHotelId() { return hotelId; }
    public UUID getRoomTypeId() { return roomTypeId; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public BigDecimal getNightlyPrice() { return nightlyPrice; }
    public BigDecimal getApprovedBasePriceAtSave() { return approvedBasePriceAtSave; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
