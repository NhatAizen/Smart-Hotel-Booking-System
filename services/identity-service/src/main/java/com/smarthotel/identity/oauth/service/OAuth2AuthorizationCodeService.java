package com.smarthotel.identity.oauth.service;

import com.smarthotel.identity.oauth.config.OAuth2Properties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OAuth2AuthorizationCodeService {

    private static final SecureRandom SECURE_RANDOM =
            new SecureRandom();

    private final OAuth2Properties properties;

    private final Map<
            String,
            AuthorizationCodeEntry
            > codes =
            new ConcurrentHashMap<>();

    public OAuth2AuthorizationCodeService(
            OAuth2Properties properties
    ) {
        this.properties = properties;
    }

    public String issue(
            UUID userId
    ) {
        removeExpiredCodes();

        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);

        String code = Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes);

        Instant expiresAt =
                Instant.now().plusSeconds(
                        properties
                                .authorizationCodeExpirationSeconds()
                );

        codes.put(
                code,
                new AuthorizationCodeEntry(
                        userId,
                        expiresAt
                )
        );

        return code;
    }

    public UUID consume(
            String code
    ) {
        if (
                code == null
                        || code.isBlank()
        ) {
            throw invalidCode();
        }

        AuthorizationCodeEntry entry =
                codes.remove(
                        code.trim()
                );

        if (
                entry == null
                        || !entry
                        .expiresAt()
                        .isAfter(
                                Instant.now()
                        )
        ) {
            throw invalidCode();
        }

        return entry.userId();
    }

    private void removeExpiredCodes() {
        Instant now = Instant.now();

        codes.entrySet().removeIf(entry ->
                !entry
                        .getValue()
                        .expiresAt()
                        .isAfter(now)
        );
    }

    private ResponseStatusException invalidCode() {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Mã đăng nhập mạng xã hội không hợp lệ hoặc đã hết hạn"
        );
    }

    private record AuthorizationCodeEntry(
            UUID userId,
            Instant expiresAt
    ) {
    }
}