package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AssistantRoomCard(UUID id, UUID hotelId, String hotelName, String name,
        BigDecimal basePrice, Integer maxAdults, Integer maxChildren, String bedType, Integer bedCount,
        BigDecimal areaSqm, Boolean breakfastIncluded, Boolean refundable, List<String> amenities,
        List<String> imageUrls, Integer availableRooms, boolean availabilityChecked, LocalDate checkIn,
        LocalDate checkOut, Integer adults, Integer children, List<String> matchReasons) {}
