package com.smarthotel.payment.payos;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smarthotel.payment.payos.config.PayOsPayoutProperties;
import com.smarthotel.payment.payos.config.PayOsProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Dependency-upgrade contract tests. Only a loopback provider stub; no real PayOS or DB. */
class PayOsPlatformCompatibilityTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicInteger requests = new AtomicInteger();
    private final AtomicInteger status = new AtomicInteger(200);
    private final AtomicReference<String> response = new AtomicReference<>();
    private final AtomicReference<CapturedRequest> captured = new AtomicReference<>();
    private HttpServer server;
    private PayOsProperties properties;
    private PayOsApiClient client;

    @BeforeEach
    void startSyntheticProvider() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            byte[] body = exchange.getRequestBody().readAllBytes();
            captured.set(new CapturedRequest(exchange.getRequestMethod(),
                    exchange.getRequestURI().getPath(),
                    exchange.getRequestHeaders().getFirst("x-client-id"),
                    exchange.getRequestHeaders().getFirst("x-api-key"),
                    new String(body, StandardCharsets.UTF_8)));
            byte[] result = response.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), result.length);
            try (var output = exchange.getResponseBody()) { output.write(result); }
        });
        server.start();
        properties = new PayOsProperties();
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.setClientId(syntheticKey());
        properties.setApiKey(syntheticKey());
        properties.setChecksumKey(syntheticKey());
        properties.setReturnUrl("http://localhost:29997/synthetic/success");
        properties.setCancelUrl("http://localhost:29997/synthetic/cancel");
        client = new PayOsApiClient(properties, new PayOsSignatureService(properties));
        response.set("{\"code\":\"00\",\"data\":{\"orderCode\":61003,\"amount\":12500,"
                + "\"amountPaid\":12500,\"id\":\"synthetic-link\",\"paymentLinkId\":\"synthetic-link\","
                + "\"status\":\"PAID\",\"checkoutUrl\":\"http://localhost:29997/synthetic/link\","
                + "\"qrCode\":\"synthetic-qr\",\"transactions\":[{\"reference\":\"synthetic-ref\"}]}}");
    }

    @AfterEach
    void stopSyntheticProvider() { if (server != null) server.stop(0); }

    @Test
    void createLinkKeepsJsonNumbersHeadersAndIndependentCanonicalSignature() throws Exception {
        var result = client.createPaymentLink(command());
        CapturedRequest request = captured.get();
        assertThat(request.method()).isEqualTo("POST");
        assertThat(request.path()).isEqualTo("/v2/payment-requests");
        assertThat(request.clientId()).isEqualTo(properties.getClientId());
        assertThat(request.apiKey()).isEqualTo(properties.getApiKey());
        JsonNode json = mapper.readTree(request.body());
        assertThat(json.path("amount").isIntegralNumber()).isTrue();
        assertThat(json.path("amount").asLong()).isEqualTo(12500);
        assertThat(json.path("orderCode").asLong()).isEqualTo(61003);
        assertThat(json.path("buyerName").asText()).isEqualTo("Synthetic Customer");
        assertThat(json.has("buyerCompanyName")).isFalse();
        assertThat(json.path("expiredAt").asLong()).isEqualTo(command().expiresAt().getEpochSecond());
        String canonical = "amount=12500&cancelUrl=" + properties.getCancelUrl()
                + "&description=synthetic invoice&orderCode=61003&returnUrl=" + properties.getReturnUrl();
        assertThat(json.path("signature").asText()).isEqualTo(hmac(canonical, properties.getChecksumKey()));
        assertThat(result.amount()).isEqualTo(12500);
        assertThat(result.paymentLinkId()).isEqualTo("synthetic-link");
        assertThat(result.status()).isEqualTo("PAID");
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void statusAndCancelResponsesKeepTheirContractWithoutDuplicateRequests() throws Exception {
        var info = client.getPaymentLink(61003);
        assertThat(captured.get().method()).isEqualTo("GET");
        assertThat(captured.get().path()).isEqualTo("/v2/payment-requests/61003");
        assertThat(info.amountPaid()).isEqualTo(12500);
        assertThat(info.reference()).isEqualTo("synthetic-ref");
        var canceled = client.cancelPaymentLink(61003, "synthetic cancellation");
        assertThat(captured.get().method()).isEqualTo("POST");
        assertThat(captured.get().path()).isEqualTo("/v2/payment-requests/61003/cancel");
        assertThat(mapper.readTree(captured.get().body()).path("cancellationReason").asText())
                .isEqualTo("synthetic cancellation");
        assertThat(canceled.paymentLinkId()).isEqualTo("synthetic-link");
        assertThat(canceled.reference()).isNull();
        assertThat(requests.get()).isEqualTo(2);
    }

    @Test
    void transportAndProviderFailuresStillFailClosedWithoutHiddenRetries() {
        status.set(503);
        assertThatThrownBy(() -> client.createPaymentLink(command())).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.getPaymentLink(61003)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.cancelPaymentLink(61003, "synthetic"))
                .isInstanceOf(IllegalStateException.class);
        status.set(200);
        response.set("{\"code\":\"99\",\"desc\":\"synthetic provider rejection\"}");
        assertThatThrownBy(() -> client.getPaymentLink(61003)).isInstanceOf(IllegalStateException.class);
        assertThat(requests.get()).isEqualTo(4);
    }

    @Test
    void signedWebhookParsingAndTamperRejectionSurviveJacksonUpgrade() throws Exception {
        ObjectNode data = mapper.createObjectNode();
        data.put("reference", "synthetic-ref");
        data.put("paymentLinkId", "synthetic-link");
        data.put("orderCode", 61003);
        data.put("desc", "synthetic invoice");
        data.put("code", "00");
        data.put("amount", 12500);
        String canonical = "amount=12500&code=00&desc=synthetic invoice&orderCode=61003"
                + "&paymentLinkId=synthetic-link&reference=synthetic-ref";
        ObjectNode envelope = mapper.createObjectNode();
        envelope.put("success", true).put("code", "00");
        envelope.set("data", data);
        envelope.put("signature", hmac(canonical, properties.getChecksumKey()));
        var result = client.verifyWebhook(mapper.readTree(mapper.writeValueAsBytes(envelope)));
        assertThat(result.success()).isTrue();
        assertThat(result.orderCode()).isEqualTo(61003);
        assertThat(result.amount()).isEqualTo(12500);
        data.put("amount", 12501);
        assertThatThrownBy(() -> client.verifyWebhook(envelope)).isInstanceOf(IllegalArgumentException.class);
        envelope.remove("signature");
        assertThatThrownBy(() -> client.verifyWebhook(envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.verifyWebhook(null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(requests.get()).isZero();
    }

    @Test
    void disabledPaymentAndDefaultDisabledPayoutNeverContactProvider() {
        properties.setEnabled(false);
        assertThat(client.isConfigured()).isFalse();
        assertThatThrownBy(() -> client.createPaymentLink(command())).isInstanceOf(IllegalStateException.class);
        PayOsPayoutProperties payout = payoutProperties();
        assertThat(payout.isEnabled()).isFalse();
        var payoutClient = new PayOsPayoutClient(payout, mapper);
        assertThat(payoutClient.isConfigured()).isFalse();
        assertThatThrownBy(() -> payoutClient.createPayout(
                new PayOsPayoutClient.PayoutCommand("synthetic-reference", 12500,
                        "synthetic", "synthetic-bin", "synthetic-account")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(requests.get()).isZero();
    }

    @Test
    void payoutCanonicalJsonAndUriEncodingRemainStableWithoutSendingPayout() throws Exception {
        PayOsPayoutProperties payout = payoutProperties();
        var payoutClient = new PayOsPayoutClient(payout, mapper);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("toBin", "synthetic-bin");
        body.put("toAccountNumber", "synthetic-account");
        body.put("referenceId", "synthetic-reference");
        body.put("description", "synthetic + &");
        body.put("category", List.of("hotel_withdrawal"));
        body.put("amount", 12500);
        String canonical = "amount=12500&category=%5B%22hotel_withdrawal%22%5D"
                + "&description=synthetic%20%2B%20%26&referenceId=synthetic-reference"
                + "&toAccountNumber=synthetic-account&toBin=synthetic-bin";
        String expected = hmac(canonical, payout.getChecksumKey());
        assertThat(payoutClient.sign(body)).isEqualTo(expected);
        List<String> reversedNames = new ArrayList<>(body.keySet());
        java.util.Collections.reverse(reversedNames);
        Map<String, Object> reversed = new LinkedHashMap<>();
        reversedNames.forEach(name -> reversed.put(name, body.get(name)));
        assertThat(payoutClient.sign(reversed)).isEqualTo(expected);
        assertThat(requests.get()).isZero();
    }

    private PayOsPayoutProperties payoutProperties() {
        PayOsPayoutProperties result = new PayOsPayoutProperties();
        result.setBaseUrl(properties.getBaseUrl());
        result.setClientId(syntheticKey());
        result.setApiKey(syntheticKey());
        result.setChecksumKey(syntheticKey());
        return result;
    }

    private PayOsApiClient.CreateLinkCommand command() {
        return new PayOsApiClient.CreateLinkCommand(61003, 12500, "synthetic invoice",
                Instant.parse("2026-10-03T00:00:00Z"), " Synthetic Customer ",
                "synthetic@example.invalid", null, " ", null, null);
    }

    private static String syntheticKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static String hmac(String value, String key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private record CapturedRequest(String method, String path, String clientId, String apiKey, String body) {}
}
