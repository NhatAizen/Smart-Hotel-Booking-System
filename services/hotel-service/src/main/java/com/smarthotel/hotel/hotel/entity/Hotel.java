package com.smarthotel.hotel.hotel.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "hotels")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Hotel {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "address", nullable = false, length = 255)
    private String address;

    @Column(name = "city", nullable = false, length = 100)
    private String city;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "star_rating", nullable = false)
    private Integer starRating;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private HotelStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Hotel(
            UUID ownerId,
            String name,
            String description,
            String address,
            String city,
            String phone,
            String email,
            Integer starRating
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.name = name;
        this.description = description;
        this.address = address;
        this.city = city;
        this.phone = phone;
        this.email = email;
        this.starRating = starRating;
        this.status = HotelStatus.ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            String name,
            String description,
            String address,
            String city,
            String phone,
            String email,
            Integer starRating,
            HotelStatus status
    ) {
        this.name = name;
        this.description = description;
        this.address = address;
        this.city = city;
        this.phone = phone;
        this.email = email;
        this.starRating = starRating;
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public void deactivate() {
        this.status = HotelStatus.INACTIVE;
        this.updatedAt = Instant.now();
    }
}