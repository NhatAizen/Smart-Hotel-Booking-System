package com.smarthotel.chat.integration.booking;

import com.smarthotel.chat.observability.CorrelationIdRestClientCustomizer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
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

    public BookingSnapshot getBooking(UUID bookingId) {
        try {
            BookingSnapshot response = restClient.get()
                    .uri("/api/bookings/{bookingId}", bookingId)
                    .retrieve()
                    .body(BookingSnapshot.class);
            if (response == null) {
                throw new IllegalStateException("Booking Service không trả về booking");
            }
            return response;
        } catch (RestClientException exception) {
            throw new IllegalStateException("Không lấy được booking " + bookingId, exception);
        }
    }

    public List<BookingSnapshot> getByStatus(String status) {
        try {
            BookingSnapshot[] response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/bookings")
                            .queryParam("status", status)
                            .build())
                    .retrieve()
                    .body(BookingSnapshot[].class);
            return response == null ? List.of() : Arrays.asList(response);
        } catch (RestClientException exception) {
            return List.of();
        }
    }

    public record BookingSnapshot(
            UUID id,
            UUID bookingGroupId,
            String bookingCode,
            UUID customerId,
            UUID hotelId,
            UUID roomTypeId,
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            Integer guestCount,
            Integer adults,
            Integer children,
            BigDecimal totalPrice,
            BigDecimal paidAmount,
            BigDecimal remainingAmount,
            String paymentOption,
            String paymentStatus,
            Integer depositPercent,
            String status,
            String bookerFirstName,
            String bookerLastName,
            String bookerEmail,
            String bookerPhone,
            String specialRequest,
            Instant checkedInAt,
            Instant checkedOutAt
    ) {
    }
}
