package com.smarthotel.ai.integration.hotel;

import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import com.smarthotel.ai.integration.hotel.dto.HotelWithRoomTypes;
import com.smarthotel.ai.integration.hotel.dto.RoomTypeResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Component
public class HotelClient {

    private final RestClient restClient;

    public HotelClient(
            @Value("${clients.hotel.base-url}") String hotelServiceUrl
    ) {
        this.restClient = RestClient.builder()
                .baseUrl(hotelServiceUrl)
                .build();
    }

    public List<HotelResponse> getHotels() {
        List<HotelResponse> hotels = restClient
                .get()
                .uri("/api/hotels")
                .retrieve()
                .onStatus(
                        HttpStatusCode::isError,
                        (request, response) -> {
                            throw new IllegalStateException(
                                    "Không thể lấy danh sách khách sạn. "
                                            + "Hotel Service trả về HTTP "
                                            + response.getStatusCode()
                            );
                        }
                )
                .body(
                        new ParameterizedTypeReference<
                                List<HotelResponse>
                                >() {
                        }
                );

        return hotels == null
                ? Collections.emptyList()
                : hotels;
    }

    public List<RoomTypeResponse> getRoomTypes(UUID hotelId) {
        List<RoomTypeResponse> roomTypes = restClient
                .get()
                .uri(
                        "/api/hotels/{hotelId}/room-types",
                        hotelId
                )
                .retrieve()
                .onStatus(
                        HttpStatusCode::isError,
                        (request, response) -> {
                            throw new IllegalStateException(
                                    "Không thể lấy loại phòng của khách sạn "
                                            + hotelId
                                            + ". Hotel Service trả về HTTP "
                                            + response.getStatusCode()
                            );
                        }
                )
                .body(
                        new ParameterizedTypeReference<
                                List<RoomTypeResponse>
                                >() {
                        }
                );

        return roomTypes == null
                ? Collections.emptyList()
                : roomTypes;
    }

    public List<HotelWithRoomTypes> getHotelsWithRoomTypes() {
        return getHotels()
                .stream()
                .filter(hotel -> hotel.id() != null)
                .filter(this::isActive)
                .map(hotel -> new HotelWithRoomTypes(
                        hotel,
                        getRoomTypes(hotel.id())
                ))
                .toList();
    }

    private boolean isActive(HotelResponse hotel) {
        return hotel.status() == null
                || hotel.status().isBlank()
                || "ACTIVE".equalsIgnoreCase(hotel.status());
    }
}