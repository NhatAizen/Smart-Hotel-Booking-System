package com.smarthotel.hotel.room.dto;

import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.entity.RoomStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record RoomResponse(
        UUID id,
        UUID hotelId,
        UUID roomTypeId,
        String roomNumber,
        Integer floor,
        RoomStatus status,
        BigDecimal customPrice,
        String note,
        Instant createdAt,
        Instant updatedAt
) {

    public static RoomResponse from(Room room) {
        return new RoomResponse(
                room.getId(),
                room.getHotelId(),
                room.getRoomTypeId(),
                room.getRoomNumber(),
                room.getFloor(),
                room.getStatus(),
                room.getCustomPrice(),
                room.getNote(),
                room.getCreatedAt(),
                room.getUpdatedAt()
        );
    }
}
