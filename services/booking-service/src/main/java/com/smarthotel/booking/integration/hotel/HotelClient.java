package com.smarthotel.booking.integration.hotel;

import com.smarthotel.booking.observability.CorrelationIdRestClientCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class HotelClient {

    private final RestClient restClient;

    public HotelClient(
            @Value("${clients.hotel.base-url}") String hotelServiceUrl
    ) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(hotelServiceUrl)
                .build();
    }

    public HotelDetails getHotel(UUID hotelId) {
        HotelDetails response = restClient.get()
                .uri("/api/hotels/{hotelId}", hotelId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalArgumentException(
                            "Không tìm thấy khách sạn đang hoạt động: " + hotelId
                    );
                })
                .body(HotelDetails.class);

        if (response == null) {
            throw new IllegalStateException("Hotel Service không trả về thông tin khách sạn");
        }
        return response;
    }

    public HotelPolicyDetails getHotelPolicy(UUID hotelId) {
        HotelPolicyDetails response = restClient.get()
                .uri("/api/hotels/{hotelId}/policies", hotelId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "Không thể tải chính sách khách sạn: " + hotelId
                    );
                })
                .body(HotelPolicyDetails.class);
        if (response == null) {
            throw new IllegalStateException("Hotel Service không trả về chính sách khách sạn");
        }
        return response;
    }

    public List<OwnedHotelDetails> getMyHotels(String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new IllegalStateException("Thiếu token Hotel Admin để kiểm tra quyền khách sạn");
        }

        List<OwnedHotelDetails> response = restClient.get()
                .uri("/api/hotels/mine")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException("Không thể tải danh sách khách sạn của Hotel Admin");
                })
                .body(new ParameterizedTypeReference<List<OwnedHotelDetails>>() {});

        return response == null ? List.of() : response;
    }

    public HotelDetails getManagedHotel(UUID hotelId, String bearerToken) {
        requireBearerToken(bearerToken);
        HotelDetails response = restClient.get()
                .uri("/api/hotels/mine/{hotelId}", hotelId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    if (httpResponse.getStatusCode().value() == 403) {
                        throw new AccessDeniedException("Bạn không có quyền xem lịch của khách sạn này");
                    }
                    throw new IllegalArgumentException(
                            "Không thể truy cập khách sạn cần quản lý: " + hotelId
                    );
                })
                .body(HotelDetails.class);

        if (response == null) {
            throw new IllegalStateException("Hotel Service không trả về thông tin khách sạn quản lý");
        }
        return response;
    }

    public List<RoomDetails> getManagedRooms(UUID hotelId, String bearerToken) {
        requireBearerToken(bearerToken);
        List<RoomDetails> response = restClient.get()
                .uri("/api/hotels/{hotelId}/rooms/manage", hotelId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "Không thể tải danh sách phòng của khách sạn: " + hotelId
                    );
                })
                .body(new ParameterizedTypeReference<List<RoomDetails>>() {});
        return response == null ? List.of() : response;
    }

    public RoomDetails getRoom(UUID roomId) {
        RoomDetails response = restClient.get()
                .uri("/api/rooms/{roomId}", roomId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalArgumentException(
                            "Không tìm thấy phòng hoặc phòng không còn được mở bán: " + roomId
                    );
                })
                .body(RoomDetails.class);

        if (response == null) {
            throw new IllegalStateException("Hotel Service không trả về thông tin phòng");
        }
        return response;
    }

    public RoomTypeDetails getRoomType(UUID roomTypeId) {
        RoomTypeDetails response = restClient.get()
                .uri("/api/room-types/{roomTypeId}", roomTypeId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalArgumentException(
                            "Không tìm thấy loại phòng đang hoạt động: " + roomTypeId
                    );
                })
                .body(RoomTypeDetails.class);

        if (response == null) {
            throw new IllegalStateException("Hotel Service không trả về thông tin loại phòng");
        }
        return response;
    }

    public void updateRoomStatus(RoomDetails room, String status, String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new IllegalStateException("Thiếu token Hotel Admin để đồng bộ trạng thái phòng");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roomTypeId", room.roomTypeId());
        body.put("roomNumber", room.roomNumber());
        body.put("floor", room.floor());
        body.put("status", status);
        body.put("customPrice", room.customPrice());
        body.put("note", room.note());

        restClient.put()
                .uri("/api/rooms/{roomId}", room.id())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể đồng bộ trạng thái phòng " + room.roomNumber()
                    );
                })
                .toBodilessEntity();
    }

    private void requireBearerToken(String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new IllegalStateException("Thiếu token Hotel Admin để kiểm tra quyền khách sạn");
        }
    }

    public record HotelDetails(
            UUID id,
            UUID ownerId,
            String name,
            String address,
            String city,
            LocalTime checkInTime,
            LocalTime checkOutTime
    ) {
    }

    public record OwnedHotelDetails(
            UUID id,
            UUID ownerId,
            String name
    ) {
    }

    public record HotelPolicyDetails(
            UUID hotelId,
            LocalTime checkInTime,
            LocalTime checkOutTime,
            Boolean lateCheckoutAllowed,
            String lateCheckoutDetails,
            String childrenPolicy,
            Boolean cribAvailable,
            Boolean extraBedAvailable,
            Boolean petsAllowed,
            Boolean smokingAllowed,
            Boolean partiesAllowed,
            LocalTime quietHoursFrom,
            LocalTime quietHoursTo,
            Boolean identityDocumentRequired,
            String checkInInstructions,
            List<AdditionalRuleDetails> additionalRules,
            boolean configured
    ) {
    }

    public record AdditionalRuleDetails(
            UUID id,
            String title,
            String content,
            Integer sortOrder
    ) {
    }

    public record RoomDetails(
            UUID id,
            UUID hotelId,
            UUID roomTypeId,
            String roomNumber,
            Integer floor,
            String status,
            BigDecimal customPrice,
            String note
    ) {
    }

    public record RoomTypeDetails(
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
            boolean breakfastIncluded,
            boolean refundable,
            boolean smokingAllowed,
            boolean payAtHotelAllowed,
            boolean depositAllowed,
            Integer depositPercent,
            boolean fullPaymentAllowed
    ) {
    }
}
