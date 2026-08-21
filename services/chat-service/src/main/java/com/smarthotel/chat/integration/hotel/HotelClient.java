package com.smarthotel.chat.integration.hotel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Component
public class HotelClient {

    private final RestClient restClient;

    public HotelClient(@Value("${clients.hotel.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public HotelSnapshot getHotel(UUID hotelId) {
        try {
            HotelSnapshot response = restClient.get()
                    .uri("/api/hotels/{hotelId}", hotelId)
                    .retrieve()
                    .body(HotelSnapshot.class);
            if (response == null) {
                throw new IllegalStateException("Hotel Service không trả về khách sạn");
            }
            return response;
        } catch (RestClientException exception) {
            throw new IllegalStateException("Không lấy được khách sạn " + hotelId, exception);
        }
    }

    public RoomTypeSnapshot getRoomType(UUID roomTypeId) {
        if (roomTypeId == null) return null;
        try {
            return restClient.get()
                    .uri("/api/room-types/{roomTypeId}", roomTypeId)
                    .retrieve()
                    .body(RoomTypeSnapshot.class);
        } catch (RestClientException exception) {
            return null;
        }
    }

    public List<RoomTypeSnapshot> getRoomTypes(UUID hotelId) {
        if (hotelId == null) return List.of();
        try {
            RoomTypeSnapshot[] response = restClient.get()
                    .uri("/api/hotels/{hotelId}/room-types", hotelId)
                    .retrieve()
                    .body(RoomTypeSnapshot[].class);
            return response == null ? List.of() : Arrays.asList(response);
        } catch (RestClientException exception) {
            return List.of();
        }
    }

    public record HotelSnapshot(
            UUID id,
            UUID ownerId,
            String name,
            String description,
            String address,
            String ward,
            String district,
            String city,
            String phone,
            String email,
            Integer starRating,
            LocalTime checkInTime,
            LocalTime checkOutTime,
            Set<String> amenities
    ) {
    }

    public record RoomTypeSnapshot(
            UUID id,
            UUID hotelId,
            String name,
            String description,
            BigDecimal basePrice,
            Integer maxAdults,
            Integer maxChildren,
            String bedType,
            Integer bedCount,
            BigDecimal areaSqm,
            Boolean breakfastIncluded,
            Boolean refundable,
            Boolean smokingAllowed,
            Boolean payAtHotelAllowed,
            Boolean depositAllowed,
            Integer depositPercent,
            Boolean fullPaymentAllowed
    ) {
    }
}
