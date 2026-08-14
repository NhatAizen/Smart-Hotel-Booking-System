package com.smarthotel.payment.wallet.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "hotel_admin_demotion_fences")
public class HotelAdminDemotionFence {

    protected HotelAdminDemotionFence() {
    }

    public HotelAdminDemotionFence(UUID ownerId) {
        Instant now = Instant.now();
        this.ownerId = ownerId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    @Id
    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "transition_id")
    private UUID transitionId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public void activate(UUID requestedTransitionId) {
        this.transitionId = requestedTransitionId;
        this.updatedAt = Instant.now();
    }

    public void deactivate() {
        this.transitionId = null;
        this.updatedAt = Instant.now();
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public UUID getTransitionId() {
        return transitionId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
