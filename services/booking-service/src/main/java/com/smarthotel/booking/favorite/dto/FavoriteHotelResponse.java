package com.smarthotel.booking.favorite.dto;

import com.smarthotel.booking.favorite.entity.CustomerHotelFavorite;

import java.time.Instant;
import java.util.UUID;

public record FavoriteHotelResponse(
        UUID id,
        UUID hotelId,
        Instant createdAt
) {
    public static FavoriteHotelResponse from(CustomerHotelFavorite favorite) {
        return new FavoriteHotelResponse(
                favorite.getId(),
                favorite.getHotelId(),
                favorite.getCreatedAt()
        );
    }
}
