package com.smarthotel.ai.integration.booking;

import com.smarthotel.ai.observability.CorrelationIdRestClientCustomizer;

import com.smarthotel.ai.integration.booking.dto.AvailabilityResponse;
import com.smarthotel.ai.integration.booking.dto.BookingResponse;
import com.smarthotel.ai.integration.booking.dto.ReviewResponse;
import com.smarthotel.ai.integration.booking.dto.ReviewSummaryResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Component
public class BookingClient {

    private final RestClient restClient;

    public BookingClient(@Value("${clients.booking.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(baseUrl).build();
    }

    public AvailabilityResponse getAvailability(UUID hotelId, LocalDate checkIn, LocalDate checkOut) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/availability/hotels/{hotelId}")
                        .queryParam("checkIn", checkIn)
                        .queryParam("checkOut", checkOut)
                        .build(hotelId))
                .retrieve()
                .body(AvailabilityResponse.class);
    }

    public ReviewSummaryResponse getReviewSummary(UUID hotelId) {
        try {
            return restClient.get()
                    .uri("/api/reviews/hotels/{hotelId}/summary", hotelId)
                    .retrieve()
                    .body(ReviewSummaryResponse.class);
        } catch (Exception ignored) {
            return new ReviewSummaryResponse(hotelId, 0, null, Collections.emptyMap(), Collections.emptyMap());
        }
    }

    public List<ReviewResponse> getReviews(UUID hotelId) {
        try {
            List<ReviewResponse> rows = restClient.get()
                    .uri("/api/reviews/hotels/{hotelId}", hotelId)
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<ReviewResponse>>() {});
            return rows == null ? Collections.emptyList() : rows;
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
    }

    public List<BookingResponse> getCustomerBookings(UUID customerId, String bearerToken) {
        List<BookingResponse> rows = restClient.get()
                .uri("/api/bookings/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .body(new ParameterizedTypeReference<List<BookingResponse>>() {});
        return rows == null ? Collections.emptyList() : rows;
    }
}
