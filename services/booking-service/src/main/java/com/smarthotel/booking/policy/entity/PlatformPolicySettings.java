package com.smarthotel.booking.policy.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "platform_policy_settings")
public class PlatformPolicySettings {

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private Short id;

    @Column(name = "minimum_booking_age", nullable = false)
    private Integer minimumBookingAge;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PlatformPolicySettings() {
    }

    public PlatformPolicySettings(Integer minimumBookingAge) {
        this.id = SINGLETON_ID;
        this.minimumBookingAge = minimumBookingAge;
        this.updatedAt = Instant.now();
    }

    public void updateMinimumBookingAge(Integer minimumBookingAge, UUID updatedBy) {
        this.minimumBookingAge = minimumBookingAge;
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    public Integer getMinimumBookingAge() { return minimumBookingAge; }
    public UUID getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
}
