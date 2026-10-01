package com.smarthotel.payment.wallet.roomchange;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomChangeFinancialMessageVerifierTest {
    private static final String SECRET =
            "booking-payment-financial-test-secret-32chars";
    private final RoomChangeFinancialMessageVerifier verifier =
            new RoomChangeFinancialMessageVerifier(SECRET);

    @Test
    void acceptsExactPayloadSignature() {
        byte[] payload = "{\"eventId\":\"signed\"}".getBytes(StandardCharsets.UTF_8);
        assertThatCode(() -> verifier.verify(payload, sign(payload))).doesNotThrowAnyException();
    }

    @Test
    void rejectsMissingOrTamperedSignature() {
        byte[] payload = "{\"eventId\":\"signed\"}".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> verifier.verify(payload, null))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> verifier.verify(payload, sign("other".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(SecurityException.class);
    }

    private static String sign(byte[] payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
