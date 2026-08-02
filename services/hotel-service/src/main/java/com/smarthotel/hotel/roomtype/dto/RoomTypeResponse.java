package com.smarthotel.hotel.roomtype.dto;

import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record RoomTypeResponse(
        UUID id,
        UUID hotelId,
        String name,
        String description,
        BigDecimal basePrice,
        Integer maxAdults,
        Integer maxChildren,
        String bedType,
        BigDecimal areaSqm,
        RoomTypeStatus status,
        Instant createdAt,
        Instant updatedAt
) {

    public static RoomTypeResponse from(RoomType roomType) {
        return new RoomTypeResponse(
                roomType.getId(),
                roomType.getHotelId(),
                roomType.getName(),
                roomType.getDescription(),
                roomType.getBasePrice(),
                roomType.getMaxAdults(),
                roomType.getMaxChildren(),
                roomType.getBedType(),
                roomType.getAreaSqm(),
                roomType.getStatus(),
                roomType.getCreatedAt(),
                roomType.getUpdatedAt()
        );
    }
}
