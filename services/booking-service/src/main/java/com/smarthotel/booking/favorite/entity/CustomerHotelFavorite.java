package com.smarthotel.booking.favorite.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "customer_hotel_favorites",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_customer_hotel_favorites",
                columnNames = {"customer_id", "hotel_id"}
        )
)
public class CustomerHotelFavorite {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "hotel_id", nullable = false, updatable = false)
    private UUID hotelId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected CustomerHotelFavorite() {
    }

    public CustomerHotelFavorite(UUID customerId, UUID hotelId) {
        this.id = UUID.randomUUID();
        this.customerId = customerId;
        this.hotelId = hotelId;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public UUID getHotelId() {
        return hotelId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
