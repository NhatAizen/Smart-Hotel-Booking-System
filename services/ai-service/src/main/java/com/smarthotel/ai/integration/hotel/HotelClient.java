package com.smarthotel.ai.integration.hotel;

import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import com.smarthotel.ai.integration.hotel.dto.HotelWithRoomTypes;
import com.smarthotel.ai.integration.hotel.dto.RoomResponse;
import com.smarthotel.ai.integration.hotel.dto.RoomTypeResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Component
public class HotelClient {

    private final RestClient restClient;

    public HotelClient(@Value("${clients.hotel.base-url}") String hotelServiceUrl) {
        this.restClient = RestClient.builder().baseUrl(hotelServiceUrl).build();
    }

    public List<HotelResponse> getHotels() {
        List<HotelResponse> hotels = restClient.get()
                .uri("/api/hotels")
                .retrieve()
                .body(new ParameterizedTypeReference<List<HotelResponse>>() {});
        return hotels == null ? Collections.emptyList() : hotels;
    }

    public HotelResponse getHotel(UUID hotelId) {
        return restClient.get()
                .uri("/api/hotels/{hotelId}", hotelId)
                .retrieve()
                .body(HotelResponse.class);
    }

    public List<RoomTypeResponse> getRoomTypes(UUID hotelId) {
        List<RoomTypeResponse> roomTypes = restClient.get()
                .uri("/api/hotels/{hotelId}/room-types", hotelId)
                .retrieve()
                .body(new ParameterizedTypeReference<List<RoomTypeResponse>>() {});
        return roomTypes == null ? Collections.emptyList() : roomTypes;
    }

    public RoomTypeResponse getRoomType(UUID roomTypeId) {
        return restClient.get()
                .uri("/api/room-types/{roomTypeId}", roomTypeId)
                .retrieve()
                .body(RoomTypeResponse.class);
    }

    public List<RoomResponse> getRooms(UUID hotelId) {
        List<RoomResponse> rooms = restClient.get()
                .uri("/api/hotels/{hotelId}/rooms", hotelId)
                .retrieve()
                .body(new ParameterizedTypeReference<List<RoomResponse>>() {});
        return rooms == null ? Collections.emptyList() : rooms;
    }

    public List<HotelWithRoomTypes> getHotelsWithRoomTypes() {
        return getHotels().stream()
                .filter(hotel -> hotel.id() != null)
                .filter(this::isActive)
                .map(hotel -> new HotelWithRoomTypes(hotel, getRoomTypes(hotel.id())))
                .toList();
    }

    private boolean isActive(HotelResponse hotel) {
        return hotel.status() == null
                || hotel.status().isBlank()
                || "ACTIVE".equalsIgnoreCase(hotel.status());
    }
}
