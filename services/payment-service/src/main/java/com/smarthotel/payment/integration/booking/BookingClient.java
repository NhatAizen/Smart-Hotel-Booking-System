package com.smarthotel.payment.integration.booking;

import com.smarthotel.payment.observability.CorrelationIdRestClientCustomizer;

import com.smarthotel.payment.payment.entity.PaymentType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Component
public class BookingClient {

    private final RestClient restClient;

    public BookingClient(@Value("${clients.booking.base-url}") String bookingServiceUrl) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(bookingServiceUrl).build();
    }

    public BookingDetails getBooking(UUID bookingId) {
        BookingDetails result = restClient.get()
                .uri("/api/bookings/{bookingId}", bookingId)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể đọc booking " + bookingId
                                    + ". Booking Service trả về HTTP " + response.getStatusCode()
                    );
                })
                .body(BookingDetails.class);
        if (result == null) throw new IllegalStateException("Booking Service không trả về dữ liệu");
        return result;
    }

    public void applyPayment(UUID bookingId, BigDecimal amount, PaymentType paymentType) {
        restClient.patch()
                .uri("/api/bookings/{bookingId}/payment", bookingId)
                .body(new ApplyPaymentRequest(amount, paymentType.name()))
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể cập nhật thanh toán cho booking " + bookingId
                                    + ". Booking Service trả về HTTP " + response.getStatusCode()
                    );
                })
                .toBodilessEntity();
    }

    public void markPaymentFailed(UUID bookingId) {
        callPatch(bookingId, "/api/bookings/{bookingId}/payment-failed", "ghi nhận thất bại");
    }

    public void markRefunded(UUID bookingId) {
        callPatch(bookingId, "/api/bookings/{bookingId}/refunded", "ghi nhận hoàn tiền");
    }

    private void callPatch(UUID bookingId, String endpoint, String action) {
        restClient.patch().uri(endpoint, bookingId).retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException(
                            "Không thể " + action + " booking " + bookingId
                                    + ". Booking Service trả về HTTP " + response.getStatusCode()
                    );
                }).toBodilessEntity();
    }

    public record BookingDetails(
            UUID id,
            UUID bookingGroupId,
            String bookingCode,
            UUID customerId,
            UUID hotelId,
            UUID roomTypeId,
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            BigDecimal totalPrice,
            BigDecimal paidAmount,
            BigDecimal remainingAmount,
            BigDecimal paymentDueAmount,
            String paymentOption,
            String paymentStatus,
            String status,
            String bookerFirstName,
            String bookerLastName,
            String bookerEmail,
            String bookerPhone,
            boolean invoiceRequested,
            String invoiceCompanyName,
            String invoiceTaxCode,
            String invoiceAddress,
            String invoiceEmail,
            Instant paymentExpiresAt
    ) {}

    private record ApplyPaymentRequest(BigDecimal amount, String paymentType) {}
}
