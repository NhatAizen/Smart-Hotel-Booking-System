package com.smarthotel.payment.payos;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smarthotel.payment.payos.config.PayOsPayoutProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class PayOsPayoutClient {
    private final PayOsPayoutProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public PayOsPayoutClient(PayOsPayoutProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .defaultHeader("x-client-id", safe(properties.getClientId()))
                .defaultHeader("x-api-key", safe(properties.getApiKey()))
                .build();
    }

    public PayoutResult createPayout(PayoutCommand command) {
        ensureConfigured();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("referenceId", command.referenceId());
        body.put("amount", command.amount());
        body.put("description", command.description());
        body.put("toBin", command.toBin());
        body.put("toAccountNumber", command.toAccountNumber());
        body.put("category", List.of("hotel_withdrawal"));

        String signature = sign(body);
        JsonNode response = restClient.post()
                .uri("/v1/payouts")
                .header("x-idempotency-key", command.referenceId())
                .header("x-signature", signature)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, httpResponse) -> {
                    throw new IllegalStateException(
                            "PayOS từ chối lệnh chi. HTTP " + httpResponse.getStatusCode()
                                    + ". Kiểm tra kênh chi hộ và số dư tài khoản chi."
                    );
                })
                .body(JsonNode.class);

        if (response == null || !"00".equals(response.path("code").asText())) {
            throw new IllegalStateException(
                    "Không thể tạo lệnh chi PayOS: "
                            + (response == null ? "không có dữ liệu" : response.path("desc").asText())
            );
        }
        JsonNode data = response.path("data");
        JsonNode transaction = data.path("transactions").isArray() && !data.path("transactions").isEmpty()
                ? data.path("transactions").get(0) : null;
        String state = transaction == null ? data.path("approvalState").asText() : transaction.path("state").asText();
        return new PayoutResult(
                data.path("id").asText(null),
                data.path("referenceId").asText(command.referenceId()),
                state,
                transaction == null ? null : transaction.path("reference").asText(null),
                transaction == null ? null : transaction.path("toAccountName").asText(null)
        );
    }

    public boolean isConfigured() { return properties.isConfigured(); }

    String sign(Map<String, Object> body) {
        try {
            JsonNode sorted = deepSort(objectMapper.valueToTree(body));
            List<String> names = new ArrayList<>();
            sorted.fieldNames().forEachRemaining(names::add);
            names.sort(Comparator.naturalOrder());
            StringBuilder data = new StringBuilder();
            for (int i = 0; i < names.size(); i++) {
                if (i > 0) data.append('&');
                String name = names.get(i);
                JsonNode value = sorted.get(name);
                String raw = value == null || value.isNull() ? ""
                        : value.isValueNode() ? value.asText() : objectMapper.writeValueAsString(value);
                data.append(name).append('=').append(encodeUri(raw));
            }
            return hmacHex(data.toString(), properties.getChecksumKey());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Không thể tạo chữ ký lệnh chi PayOS", exception);
        }
    }

    private JsonNode deepSort(JsonNode node) {
        if (node == null || node.isValueNode()) return node;
        if (node.isArray()) {
            ArrayNode result = objectMapper.createArrayNode();
            node.forEach(item -> result.add(deepSort(item)));
            return result;
        }
        ObjectNode result = objectMapper.createObjectNode();
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        names.sort(Comparator.naturalOrder());
        names.forEach(name -> result.set(name, deepSort(node.get(name))));
        return result;
    }

    private static String encodeUri(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%7E", "~");
    }

    private static String hmacHex(String data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) hex.append(String.format("%02x", value));
            return hex.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể tạo chữ ký lệnh chi PayOS", exception);
        }
    }

    private void ensureConfigured() {
        if (!properties.isConfigured()) {
            throw new IllegalStateException(
                    "Kênh chi hộ PayOS chưa được cấu hình. Kênh thanh toán không tự động cấp quyền chi hộ."
            );
        }
    }
    private static String safe(String value) { return value == null ? "" : value; }

    public record PayoutCommand(String referenceId, long amount, String description,
                                String toBin, String toAccountNumber) {}
    public record PayoutResult(String payoutId, String referenceId, String state,
                               String bankReference, String accountName) {}
}
