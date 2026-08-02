package com.smarthotel.payment.integration.booking;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Component
public class BookingClient {

    private final RestClient restClient;

    public BookingClient(
            @Value("${clients.booking.base-url}")
            String bookingServiceUrl
    ) {
        this.restClient = RestClient.builder()
                .baseUrl(bookingServiceUrl)
                .build();
    }

    public void confirmBooking(UUID bookingId) {
        callBookingEndpoint(
                bookingId,
                "/api/bookings/{bookingId}/confirm",
                "xác nhận"
        );
    }

    public void cancelBooking(UUID bookingId) {
        callBookingEndpoint(
                bookingId,
                "/api/bookings/{bookingId}/cancel",
                "hủy"
        );
    }

    private void callBookingEndpoint(
            UUID bookingId,
            String endpoint,
            String action
    ) {
        restClient.patch()
                .uri(endpoint, bookingId)
                .retrieve()
                .onStatus(
                        HttpStatusCode::isError,
                        (request, response) -> {
                            throw new IllegalStateException(
                                    "Không thể "
                                            + action
                                            + " booking "
                                            + bookingId
                                            + ". Booking Service trả về HTTP "
                                            + response.getStatusCode()
                            );
                        }
                )
                .toBodilessEntity();
    }
}