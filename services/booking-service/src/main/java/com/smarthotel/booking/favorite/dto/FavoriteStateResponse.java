package com.smarthotel.booking.favorite.dto;

import java.util.UUID;

public record FavoriteStateResponse(
        UUID hotelId,
        boolean favorite
) {
}
