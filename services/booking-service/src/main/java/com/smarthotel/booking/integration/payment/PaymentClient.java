package com.smarthotel.booking.integration.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

@Component
public class PaymentClient {
    private final RestClient restClient;

    public PaymentClient(@Value("${clients.payment.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl).build();
    }

    public void requireRefundForBooking(String bearerToken, UUID refundRequestId, UUID bookingId) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new IllegalStateException("Thiếu token System Admin để xác minh yêu cầu hoàn tiền");
        }
        List<RefundSummary> refunds = restClient.get()
                .uri("/api/admin/refunds")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    throw new IllegalStateException("Không thể xác minh yêu cầu hoàn tiền liên quan");
                })
                .body(new ParameterizedTypeReference<List<RefundSummary>>() {});
        boolean matches = refunds != null && refunds.stream().anyMatch(item ->
                refundRequestId.equals(item.id()) && bookingId.equals(item.bookingId()));
        if (!matches) {
            throw new IllegalArgumentException("Yêu cầu hoàn tiền không thuộc booking của khiếu nại");
        }
    }

    public void requireCompletedRefund(String bearerToken, boolean hotelView, UUID refundId,
                                       UUID bookingId, BigDecimal requiredAmount) {
        if (refundId == null) throw new IllegalArgumentException("Vui lòng liên kết giao dịch hoàn tiền đã hoàn tất");
        if (bearerToken == null || bearerToken.isBlank()) throw new IllegalStateException("Thiếu quyền xác minh hoàn tiền");
        List<RefundSummary> refunds = restClient.get()
                .uri(hotelView ? "/api/refunds/hotel" : "/api/admin/refunds")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken).retrieve()
                .body(new ParameterizedTypeReference<List<RefundSummary>>() {});
        RefundSummary refund = refunds == null ? null : refunds.stream()
                .filter(item -> refundId.equals(item.id()) && bookingId.equals(item.bookingId())).findFirst().orElse(null);
        if (refund == null) throw new IllegalArgumentException("Yêu cầu hoàn tiền không thuộc booking của khiếu nại");
        if (!"COMPLETED".equals(refund.status()) || refund.totalPaidAmount() == null
                || refund.totalPaidAmount().compareTo(requiredAmount) < 0) {
            throw new IllegalStateException("Chưa hoàn tất số tiền phải hoàn theo quyết định");
        }
    }

    public record RefundSummary(UUID id, UUID bookingId, String status, BigDecimal totalPaidAmount) {}
}
