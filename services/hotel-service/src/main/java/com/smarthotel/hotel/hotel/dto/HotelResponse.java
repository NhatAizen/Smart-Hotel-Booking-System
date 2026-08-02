package com.smarthotel.hotel.hotel.dto;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelStatus;

import java.time.Instant;
import java.util.UUID;

public record HotelResponse(
        UUID id,
        UUID ownerId,
        String name,
        String description,
        String address,
        String city,
        String phone,
        String email,
        Integer starRating,
        HotelStatus status,
        Instant createdAt,
        Instant updatedAt
) {

    public static HotelResponse from(Hotel hotel) {
        return new HotelResponse(
                hotel.getId(),
                hotel.getOwnerId(),
                hotel.getName(),
                hotel.getDescription(),
                hotel.getAddress(),
                hotel.getCity(),
                hotel.getPhone(),
                hotel.getEmail(),
                hotel.getStarRating(),
                hotel.getStatus(),
                hotel.getCreatedAt(),
                hotel.getUpdatedAt()
        );
    }
}