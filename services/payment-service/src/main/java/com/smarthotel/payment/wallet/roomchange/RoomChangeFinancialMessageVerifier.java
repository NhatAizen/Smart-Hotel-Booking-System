package com.smarthotel.payment.wallet.roomchange;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

@Component
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialMessageVerifier {
    private static final String ALGORITHM = "HmacSHA256";
    private final byte[] secret;

    public RoomChangeFinancialMessageVerifier(
            @Value("${features.room-change-financial-hmac-secret:}") String secret
    ) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException(
                    "ROOM_CHANGE_FINANCIAL_HMAC_SECRET phải có ít nhất 32 ký tự khi bật wallet credit"
            );
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public void verify(byte[] payload, String suppliedSignature) {
        if (suppliedSignature == null || suppliedSignature.isBlank()) {
            throw new SecurityException("Thiếu chữ ký financial command");
        }
        byte[] supplied;
        try {
            supplied = Base64.getDecoder().decode(suppliedSignature);
        } catch (IllegalArgumentException exception) {
            throw new SecurityException("Chữ ký financial command không hợp lệ", exception);
        }
        byte[] expected = signature(payload);
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw new SecurityException("Chữ ký financial command không hợp lệ");
        }
    }

    public String sign(byte[] payload) { return Base64.getEncoder().encodeToString(signature(payload)); }

    private byte[] signature(byte[] payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return mac.doFinal(payload);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Không thể xác minh financial command", exception);
        }
    }
}
