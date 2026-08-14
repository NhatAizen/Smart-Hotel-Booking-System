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
@Table(name = "special_pricing_dates")
public class SpecialPricingDate {
    protected SpecialPricingDate() {}

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "pricing_date", nullable = false, unique = true)
    private LocalDate pricingDate;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "surcharge_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal surchargePercent;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }
    public LocalDate getPricingDate() { return pricingDate; }
    public String getName() { return name; }
    public BigDecimal getSurchargePercent() { return surchargePercent; }
    public boolean isActive() { return active; }
}
