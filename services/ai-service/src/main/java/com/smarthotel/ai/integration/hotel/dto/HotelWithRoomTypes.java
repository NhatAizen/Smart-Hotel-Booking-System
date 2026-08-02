package com.smarthotel.ai.integration.hotel.dto;

import java.util.List;

public record HotelWithRoomTypes(

        HotelResponse hotel,
        List<RoomTypeResponse> roomTypes

) {
}