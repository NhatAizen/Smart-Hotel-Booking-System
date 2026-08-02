package com.smarthotel.hotel.roomtype.entity;

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
@Table(name = "room_types")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoomType {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "base_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal basePrice;

    @Column(name = "max_adults", nullable = false)
    private Integer maxAdults;

    @Column(name = "max_children", nullable = false)
    private Integer maxChildren;

    @Column(name = "bed_type", length = 80)
    private String bedType;

    @Column(name = "area_sqm", precision = 8, scale = 2)
    private BigDecimal areaSqm;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RoomTypeStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public RoomType(
            UUID hotelId,
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            BigDecimal areaSqm
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.hotelId = hotelId;
        this.name = name;
        this.description = description;
        this.basePrice = basePrice;
        this.maxAdults = maxAdults;
        this.maxChildren = maxChildren;
        this.bedType = bedType;
        this.areaSqm = areaSqm;
        this.status = RoomTypeStatus.ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            BigDecimal areaSqm,
            RoomTypeStatus status
    ) {
        this.name = name;
        this.description = description;
        this.basePrice = basePrice;
        this.maxAdults = maxAdults;
        this.maxChildren = maxChildren;
        this.bedType = bedType;
        this.areaSqm = areaSqm;
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public void deactivate() {
        this.status = RoomTypeStatus.INACTIVE;
        this.updatedAt = Instant.now();
    }
}
