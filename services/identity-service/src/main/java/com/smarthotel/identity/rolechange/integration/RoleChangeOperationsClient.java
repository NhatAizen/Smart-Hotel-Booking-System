package com.smarthotel.identity.rolechange.integration;

import com.smarthotel.identity.rolechange.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.identity.rolechange.exception.RoleChangeDependencyException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

@Component
public class RoleChangeOperationsClient {

    private final RestClient hotelClient;
    private final RestClient bookingClient;
    private final RestClient paymentClient;

    public RoleChangeOperationsClient(
            @Value("${clients.hotel.base-url:http://hotel-service:8082}")
            String hotelServiceUrl,
            @Value("${clients.booking.base-url:http://booking-service:8083}")
            String bookingServiceUrl,
            @Value("${clients.payment.base-url:http://payment-service:8084}")
            String paymentServiceUrl
    ) {
        this.hotelClient = client(hotelServiceUrl);
        this.bookingClient = client(bookingServiceUrl);
        this.paymentClient = client(paymentServiceUrl);
    }

    private RestClient client(String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory =
                new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(2));
        requestFactory.setReadTimeout(Duration.ofSeconds(5));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public OwnerHotelPortfolioResponse getOwnerHotels(
            UUID ownerId,
            String bearerToken
    ) {
        return requireBody(
                call(() -> hotelClient.get()
                        .uri("/api/role-change/owners/{ownerId}/hotels", ownerId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(bearerToken))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw dependency("Hotel Service", response.getStatusCode().value());
                        })
                        .body(OwnerHotelPortfolioResponse.class), "Hotel Service"),
                "Hotel Service"
        );
    }

    public BookingEligibilityResponse getBookingEligibility(
            UUID ownerId,
            List<UUID> hotelIds,
            String bearerToken
    ) {
        return requireBody(
                call(() -> bookingClient.post()
                        .uri("/api/role-change/eligibility/bookings")
                        .header(HttpHeaders.AUTHORIZATION, bearer(bearerToken))
                        .body(new RoleChangeBookingEligibilityRequest(ownerId, hotelIds))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw dependency("Booking Service", response.getStatusCode().value());
                        })
                        .body(BookingEligibilityResponse.class), "Booking Service"),
                "Booking Service"
        );
    }

    public PaymentEligibilityResponse getPaymentEligibility(
            UUID ownerId,
            String bearerToken
    ) {
        return requireBody(
                call(() -> paymentClient.get()
                        .uri("/api/role-change/owners/{ownerId}/payment-eligibility", ownerId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(bearerToken))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw dependency("Payment Service", response.getStatusCode().value());
                        })
                        .body(PaymentEligibilityResponse.class), "Payment Service"),
                "Payment Service"
        );
    }

    public DeactivateOwnerHotelsResponse deactivateOwnerHotels(
            UUID ownerId,
            String bearerToken
    ) {
        return requireBody(
                call(() -> hotelClient.post()
                        .uri("/api/role-change/owners/{ownerId}/deactivate-hotels", ownerId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(bearerToken))
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (request, response) -> {
                            throw dependency("Hotel Service", response.getStatusCode().value());
                        })
                        .body(DeactivateOwnerHotelsResponse.class), "Hotel Service"),
                "Hotel Service"
        );
    }

    private <T> T call(RemoteCall<T> call, String serviceName) {
        try {
            return call.execute();
        } catch (RoleChangeDependencyException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new RoleChangeDependencyException(
                    serviceName + " tạm thời không phản hồi khi kiểm tra điều kiện đổi vai trò",
                    exception
            );
        }
    }

    private <T> T requireBody(T body, String serviceName) {
        if (body == null) {
            throw new RoleChangeDependencyException(
                    serviceName + " không trả về kết quả kiểm tra điều kiện đổi vai trò"
            );
        }
        return body;
    }

    private RoleChangeDependencyException dependency(
            String serviceName,
            int status
    ) {
        return new RoleChangeDependencyException(
                serviceName + " từ chối kiểm tra điều kiện đổi vai trò (HTTP " + status + ")"
        );
    }

    private String bearer(String token) {
        if (token == null || token.isBlank()) {
            throw new RoleChangeDependencyException(
                    "Thiếu access token để kiểm tra điều kiện đổi vai trò"
            );
        }
        return "Bearer " + token;
    }

    @FunctionalInterface
    private interface RemoteCall<T> {
        T execute();
    }

    public record OwnerHotelPortfolioResponse(
            List<UUID> hotelIds,
            long totalHotels,
            long activeHotels
    ) {
    }

    public record DeactivateOwnerHotelsResponse(long deactivatedHotels) {
    }

    public record BookingEligibilityResponse(
            boolean eligible,
            long currentStayCount,
            long actionableBookingCount,
            List<String> blockers
    ) {
    }

    public record PaymentEligibilityResponse(
            boolean eligible,
            long openWithdrawalCount,
            BigDecimal availableBalance,
            BigDecimal pendingBalance,
            BigDecimal lockedBalance,
            BigDecimal commissionDebt,
            long pendingPaymentCount,
            long unsettledPaymentCount,
            long openWalletTopUpCount,
            List<String> blockers
    ) {
    }
}
