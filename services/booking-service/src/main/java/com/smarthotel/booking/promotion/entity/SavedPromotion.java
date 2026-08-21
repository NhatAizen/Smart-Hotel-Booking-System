package com.smarthotel.booking.promotion.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "saved_promotions",
        uniqueConstraints = @UniqueConstraint(name = "uq_saved_promotion_user", columnNames = {"promotion_id", "user_id"})
)
public class SavedPromotion {
    protected SavedPromotion() {}

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "promotion_id", nullable = false)
    private UUID promotionId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "saved_at", nullable = false, updatable = false)
    private Instant savedAt;

    public SavedPromotion(UUID promotionId, UUID userId) {
        this.id = UUID.randomUUID();
        this.promotionId = promotionId;
        this.userId = userId;
        this.savedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPromotionId() { return promotionId; }
    public UUID getUserId() { return userId; }
    public Instant getSavedAt() { return savedAt; }
}
