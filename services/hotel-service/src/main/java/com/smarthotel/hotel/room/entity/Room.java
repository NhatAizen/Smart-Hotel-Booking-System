package com.smarthotel.hotel.room.entity;

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
@Table(name = "rooms")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Room {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "hotel_id", nullable = false)
    private UUID hotelId;

    @Column(name = "room_type_id", nullable = false)
    private UUID roomTypeId;

    @Column(name = "room_number", nullable = false, length = 40)
    private String roomNumber;

    @Column(name = "floor")
    private Integer floor;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private RoomStatus status;

    @Column(name = "custom_price", precision = 12, scale = 2)
    private BigDecimal customPrice;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Room(
            UUID hotelId,
            UUID roomTypeId,
            String roomNumber,
            Integer floor,
            BigDecimal customPrice,
            String note
    ) {
        Instant now = Instant.now();

        this.id = UUID.randomUUID();
        this.hotelId = hotelId;
        this.roomTypeId = roomTypeId;
        this.roomNumber = roomNumber;
        this.floor = floor;
        this.status = RoomStatus.AVAILABLE;
        this.customPrice = customPrice;
        this.note = note;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            UUID roomTypeId,
            String roomNumber,
            Integer floor,
            RoomStatus status,
            BigDecimal customPrice,
            String note
    ) {
        this.roomTypeId = roomTypeId;
        this.roomNumber = roomNumber;
        this.floor = floor;
        this.status = status;
        this.customPrice = customPrice;
        this.note = note;
        this.updatedAt = Instant.now();
    }

    public void deactivate() {
        this.status = RoomStatus.INACTIVE;
        this.updatedAt = Instant.now();
    }
}
