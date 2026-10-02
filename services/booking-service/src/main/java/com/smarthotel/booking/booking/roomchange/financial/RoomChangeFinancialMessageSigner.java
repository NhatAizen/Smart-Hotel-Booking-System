package com.smarthotel.booking.booking.roomchange.financial;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

@Component
@ConditionalOnProperty(
        name = "features.room-change-customer-wallet-credit-enabled",
        havingValue = "true"
)
public class RoomChangeFinancialMessageSigner {
    private static final String ALGORITHM = "HmacSHA256";
    private final byte[] secret;

    public RoomChangeFinancialMessageSigner(
            @Value("${features.room-change-financial-hmac-secret:}") String secret
    ) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException(
                    "ROOM_CHANGE_FINANCIAL_HMAC_SECRET phải có ít nhất 32 ký tự khi bật wallet credit"
            );
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String sign(byte[] payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return Base64.getEncoder().encodeToString(mac.doFinal(payload));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Không thể ký financial command", exception);
        }
    }

    public void verify(byte[] payload, String signature) {
        if (signature == null) throw new SecurityException("Missing financial result signature");
        try {
            if (!java.security.MessageDigest.isEqual(Base64.getDecoder().decode(sign(payload)),
                    Base64.getDecoder().decode(signature))) {
                throw new SecurityException("Invalid financial result signature");
            }
        } catch (IllegalArgumentException invalid) {
            throw new SecurityException("Invalid financial result signature", invalid);
        }
    }
}
