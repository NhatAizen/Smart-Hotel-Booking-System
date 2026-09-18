package com.smarthotel.booking.integration.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ComplaintRefundVerificationTest {
    private final UUID refundId = UUID.randomUUID();
    private final UUID bookingId = UUID.randomUUID();
    private PaymentClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl("http://payment.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PaymentClient("http://payment.test");
        ReflectionTestUtils.setField(client, "restClient", builder.build());
    }

    @Test
    void hotelVerificationUsesExistingHotelRefundEndpoint() {
        expect("/api/refunds/hotel", bookingId, "COMPLETED", 1000);
        client.requireCompletedRefund("test-token", true, refundId, bookingId, BigDecimal.valueOf(500));
        server.verify();
    }

    @Test
    void refundForAnotherBookingIsRejected() {
        expect("/api/admin/refunds", UUID.randomUUID(), "COMPLETED", 1000);
        assertThatThrownBy(() -> client.requireCompletedRefund("test-token", false, refundId, bookingId, BigDecimal.valueOf(500)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @CsvSource({"PENDING_HOTEL_REVIEW,1000", "PARTIALLY_COMPLETED,1000", "REJECTED,1000", "COMPLETED,499"})
    void incompleteOrInsufficientRefundDoesNotSatisfyDecision(String status, int amount) {
        expect("/api/admin/refunds", bookingId, status, amount);
        assertThatThrownBy(() -> client.requireCompletedRefund("test-token", false, refundId, bookingId, BigDecimal.valueOf(500)))
                .isInstanceOf(IllegalStateException.class);
    }

    private void expect(String path, UUID relatedBooking, String status, int amount) {
        server.expect(requestTo("http://payment.test" + path)).andExpect(header("Authorization", "Bearer test-token"))
                .andRespond(withSuccess("""
                        [{"id":"%s","bookingId":"%s","status":"%s","totalPaidAmount":%d}]
                        """.formatted(refundId, relatedBooking, status, amount), MediaType.APPLICATION_JSON));
    }
}
