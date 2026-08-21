package com.smarthotel.payment.integration.hotel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.LocalTime;
import java.util.UUID;

@Component
public class HotelClient {
    private final RestClient restClient;

    public HotelClient(@Value("${clients.hotel.base-url}") String hotelServiceUrl) {
        this.restClient = RestClient.builder().baseUrl(hotelServiceUrl).build();
    }

    public HotelDetails getHotel(UUID hotelId) {
        HotelDetails result = restClient.get()
                .uri("/api/hotels/{hotelId}", hotelId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể đọc khách sạn " + hotelId
                                    + ". Hotel Service trả về HTTP " + response.getStatusCode()
                    );
                })
                .body(HotelDetails.class);
        if (result == null) throw new IllegalStateException("Hotel Service không trả về dữ liệu");
        return result;
    }

    public RoomTypeDetails getRoomType(UUID roomTypeId) {
        RoomTypeDetails result = restClient.get()
                .uri("/api/room-types/{roomTypeId}", roomTypeId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể đọc loại phòng " + roomTypeId
                                    + ". Hotel Service trả về HTTP " + response.getStatusCode()
                    );
                })
                .body(RoomTypeDetails.class);
        if (result == null) throw new IllegalStateException("Hotel Service không trả về loại phòng");
        return result;
    }

    public record HotelDetails(
            UUID id, UUID ownerId, String name, String approvalStatus, String status,
            LocalTime checkInTime, LocalTime checkOutTime
    ) {}

    public record RoomTypeDetails(UUID id, UUID hotelId, String name, boolean refundable) {}
}
