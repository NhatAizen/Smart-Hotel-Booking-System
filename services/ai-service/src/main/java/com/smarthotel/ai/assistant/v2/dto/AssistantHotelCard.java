package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record AssistantHotelCard(
        UUID hotelId,
        String name,
        String city,
        String address,
        Integer starRating,
        String coverImageUrl,
        Double averageRating,
        Long reviewCount,
        UUID roomTypeId,
        String roomTypeName,
        BigDecimal pricePerNight,
        Integer maxAdults,
        Integer maxChildren,
        Integer availableRooms,
        boolean availabilityChecked,
        boolean exactMatch,
        boolean refundable,
        boolean breakfastIncluded,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        List<String> amenities,
        List<String> matchReasons
) {
}
