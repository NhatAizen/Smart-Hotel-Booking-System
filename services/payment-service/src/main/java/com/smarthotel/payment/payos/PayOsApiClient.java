package com.smarthotel.payment.payos;

import com.fasterxml.jackson.databind.JsonNode;
import com.smarthotel.payment.payos.config.PayOsProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PayOsApiClient {

    private final RestClient restClient;
    private final PayOsProperties properties;
    private final PayOsSignatureService signatureService;

    public PayOsApiClient(
            PayOsProperties properties,
            PayOsSignatureService signatureService
    ) {
        this.properties = properties;
        this.signatureService = signatureService;
        this.restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .defaultHeader("x-client-id", valueOrEmpty(properties.getClientId()))
                .defaultHeader("x-api-key", valueOrEmpty(properties.getApiKey()))
                .build();
    }

    public CreateLinkResult createPaymentLink(CreateLinkCommand command) {
        ensureConfigured();

        long amount = command.amount();
        String signature = signatureService.signPaymentRequest(
                command.orderCode(),
                amount,
                command.description(),
                properties.getReturnUrl(),
                properties.getCancelUrl()
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("orderCode", command.orderCode());
        body.put("amount", amount);
        body.put("description", command.description());
        putIfText(body, "buyerName", command.buyerName());
        putIfText(body, "buyerEmail", command.buyerEmail());
        putIfText(body, "buyerPhone", command.buyerPhone());
        putIfText(body, "buyerCompanyName", command.buyerCompanyName());
        putIfText(body, "buyerTaxCode", command.buyerTaxCode());
        putIfText(body, "buyerAddress", command.buyerAddress());
        body.put("cancelUrl", properties.getCancelUrl());
        body.put("returnUrl", properties.getReturnUrl());
        body.put("expiredAt", command.expiresAt().getEpochSecond());
        body.put("signature", signature);

        JsonNode response = restClient.post()
                .uri("/v2/payment-requests")
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "PayOS từ chối tạo link thanh toán. HTTP "
                                    + httpResponse.getStatusCode()
                    );
                })
                .body(JsonNode.class);

        JsonNode data = requireSuccess(response, "tạo link thanh toán");
        return new CreateLinkResult(
                data.path("orderCode").asLong(),
                data.path("amount").asLong(),
                text(data, "paymentLinkId"),
                text(data, "checkoutUrl"),
                text(data, "qrCode"),
                text(data, "status")
        );
    }

    public PaymentLinkInfo getPaymentLink(long orderCode) {
        ensureConfigured();
        JsonNode response = restClient.get()
                .uri("/v2/payment-requests/{orderCode}", orderCode)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "Không thể đọc trạng thái PayOS. HTTP "
                                    + httpResponse.getStatusCode()
                    );
                })
                .body(JsonNode.class);

        JsonNode data = requireSuccess(response, "đọc trạng thái thanh toán");
        String reference = null;
        JsonNode transactions = data.path("transactions");
        if (transactions.isArray() && !transactions.isEmpty()) {
            reference = text(transactions.get(0), "reference");
        }
        return new PaymentLinkInfo(
                data.path("orderCode").asLong(),
                data.path("amount").asLong(),
                data.path("amountPaid").asLong(),
                text(data, "status"),
                text(data, "id"),
                reference
        );
    }

    public PaymentLinkInfo cancelPaymentLink(long orderCode, String reason) {
        ensureConfigured();
        JsonNode response = restClient.post()
                .uri("/v2/payment-requests/{orderCode}/cancel", orderCode)
                .body(Map.of("cancellationReason", reason))
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "Không thể hủy link PayOS. HTTP "
                                    + httpResponse.getStatusCode()
                    );
                })
                .body(JsonNode.class);

        JsonNode data = requireSuccess(response, "hủy link thanh toán");
        return new PaymentLinkInfo(
                data.path("orderCode").asLong(),
                data.path("amount").asLong(),
                data.path("amountPaid").asLong(),
                text(data, "status"),
                text(data, "id"),
                null
        );
    }

    public WebhookData verifyWebhook(JsonNode payload) {
        if (payload == null) {
            throw new IllegalArgumentException("Webhook PayOS rỗng");
        }
        JsonNode data = payload.get("data");
        String signature = payload.path("signature").asText(null);
        if (!signatureService.verifyWebhook(data, signature)) {
            throw new IllegalArgumentException("Chữ ký webhook PayOS không hợp lệ");
        }
        return new WebhookData(
                payload.path("success").asBoolean(false),
                payload.path("code").asText(),
                data.path("orderCode").asLong(),
                data.path("amount").asLong(),
                text(data, "reference"),
                text(data, "paymentLinkId"),
                text(data, "code"),
                text(data, "desc")
        );
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    private void ensureConfigured() {
        if (!properties.isConfigured()) {
            throw new IllegalStateException(
                    "PayOS chưa được cấu hình. Hãy điền các khóa trong file .env rồi khởi động lại payment-service"
            );
        }
    }

    private JsonNode requireSuccess(JsonNode response, String action) {
        if (response == null) {
            throw new IllegalStateException("PayOS không trả về dữ liệu khi " + action);
        }
        if (!"00".equals(response.path("code").asText())) {
            throw new IllegalStateException(
                    "PayOS không thể " + action + ": " + response.path("desc").asText("unknown")
            );
        }
        JsonNode data = response.get("data");
        if (data == null || data.isNull()) {
            throw new IllegalStateException("PayOS không trả về data khi " + action);
        }
        return data;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static void putIfText(Map<String, Object> body, String key, String value) {
        if (value != null && !value.isBlank()) {
            body.put(key, value.trim());
        }
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    public record CreateLinkCommand(
            long orderCode,
            long amount,
            String description,
            Instant expiresAt,
            String buyerName,
            String buyerEmail,
            String buyerPhone,
            String buyerCompanyName,
            String buyerTaxCode,
            String buyerAddress
    ) {
    }

    public record CreateLinkResult(
            long orderCode,
            long amount,
            String paymentLinkId,
            String checkoutUrl,
            String qrCode,
            String status
    ) {
    }

    public record PaymentLinkInfo(
            long orderCode,
            long amount,
            long amountPaid,
            String status,
            String paymentLinkId,
            String reference
    ) {
    }

    public record WebhookData(
            boolean success,
            String envelopeCode,
            long orderCode,
            long amount,
            String reference,
            String paymentLinkId,
            String transactionCode,
            String transactionDescription
    ) {
    }
}
