package com.smarthotel.notification.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalApiKeyVerifier {
    private final byte[] expected;

    public InternalApiKeyVerifier(@Value("${app.internal-api-key}") String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("NOTIFICATION_INTERNAL_API_KEY chưa được cấu hình");
        }
        this.expected = apiKey.getBytes(StandardCharsets.UTF_8);
    }

    public void verify(String suppliedApiKey) {
        byte[] supplied = suppliedApiKey == null
                ? new byte[0]
                : suppliedApiKey.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw new AccessDeniedException("Internal notification API key không hợp lệ");
        }
    }
}
