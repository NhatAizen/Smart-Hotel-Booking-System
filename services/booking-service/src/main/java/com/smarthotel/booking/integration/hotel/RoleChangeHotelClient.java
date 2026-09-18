package com.smarthotel.booking.integration.hotel;

import com.smarthotel.booking.observability.CorrelationIdRestClientCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.UUID;

@Component
public class RoleChangeHotelClient {

    private final RestClient restClient;

    public RoleChangeHotelClient(
            @Value("${clients.hotel.base-url}") String hotelServiceUrl
    ) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(hotelServiceUrl)
                .build();
    }

    public OwnerHotelPortfolio getOwnerHotelPortfolio(
            UUID ownerId,
            String bearerToken
    ) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new IllegalStateException(
                    "Thiếu token để xác minh danh sách khách sạn"
            );
        }

        OwnerHotelPortfolio response = restClient.get()
                .uri("/api/role-change/owners/{ownerId}/hotels", ownerId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "Không thể xác minh danh sách khách sạn của chủ tài khoản"
                    );
                })
                .body(OwnerHotelPortfolio.class);

        if (response == null || response.hotelIds() == null) {
            throw new IllegalStateException(
                    "Hotel Service không trả về danh sách khách sạn của chủ tài khoản"
            );
        }
        return response;
    }

    public record OwnerHotelPortfolio(
            List<UUID> hotelIds,
            long totalHotels,
            long activeHotels
    ) {
    }
}
