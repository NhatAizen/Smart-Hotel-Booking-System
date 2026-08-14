package com.smarthotel.payment.payos;

import com.fasterxml.jackson.databind.JsonNode;
import com.smarthotel.payment.payos.config.PayOsProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Component
public class PayOsSignatureService {

    private final PayOsProperties properties;

    public PayOsSignatureService(PayOsProperties properties) {
        this.properties = properties;
    }

    public String signPaymentRequest(
            long orderCode,
            long amount,
            String description,
            String returnUrl,
            String cancelUrl
    ) {
        String data = "amount=" + amount
                + "&cancelUrl=" + cancelUrl
                + "&description=" + description
                + "&orderCode=" + orderCode
                + "&returnUrl=" + returnUrl;
        return hmacHex(data);
    }

    public boolean verifyWebhook(JsonNode data, String signature) {
        if (data == null || signature == null || signature.isBlank()) {
            return false;
        }

        List<String> names = new ArrayList<>();
        data.fieldNames().forEachRemaining(names::add);
        names.sort(Comparator.naturalOrder());

        StringBuilder canonical = new StringBuilder();
        for (int index = 0; index < names.size(); index++) {
            String name = names.get(index);
            JsonNode value = data.get(name);
            if (index > 0) {
                canonical.append('&');
            }
            canonical.append(name).append('=').append(toSignatureValue(value));
        }

        byte[] expected = hmacHex(canonical.toString())
                .getBytes(StandardCharsets.UTF_8);
        byte[] actual = signature.trim().toLowerCase()
                .getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }

    private String toSignatureValue(JsonNode value) {
        if (value == null || value.isNull()) {
            return "";
        }
        if (value.isTextual()) {
            return value.textValue();
        }
        if (value.isNumber() || value.isBoolean()) {
            return value.asText();
        }
        return value.toString();
    }

    private String hmacHex(String data) {
        if (!properties.isConfigured()) {
            throw new IllegalStateException(
                    "PayOS chưa được cấu hình. Hãy điền PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY"
            );
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    properties.getChecksumKey().getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256"
            ));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                hex.append(String.format("%02x", value));
            }
            return hex.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể tạo chữ ký PayOS", exception);
        }
    }
}
