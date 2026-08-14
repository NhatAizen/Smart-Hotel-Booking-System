package com.smarthotel.hotel.hotel.dto;

import java.util.List;
import java.util.UUID;

public record OwnerHotelPortfolioResponse(
        List<UUID> hotelIds,
        long totalHotels,
        long activeHotels
) {
}
