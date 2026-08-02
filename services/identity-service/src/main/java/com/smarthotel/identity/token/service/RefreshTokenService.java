package com.smarthotel.identity.token.service;

import com.smarthotel.identity.common.exception.InvalidRefreshTokenException;
import com.smarthotel.identity.security.JwtProperties;
import com.smarthotel.identity.token.entity.RefreshToken;
import com.smarthotel.identity.token.repository.RefreshTokenRepository;
import com.smarthotel.identity.user.entity.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private static final int RAW_TOKEN_BYTES = 48;

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProperties;
    private final SecureRandom secureRandom;

    public RefreshTokenService(
            RefreshTokenRepository refreshTokenRepository,
            JwtProperties jwtProperties
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtProperties = jwtProperties;
        this.secureRandom = new SecureRandom();
    }

    /**
     * Tạo refresh token mới cho một phiên đăng nhập.
     *
     * Chỉ token thô được trả cho client.
     * Database chỉ nhận SHA-256 hash.
     */
    @Transactional
    public String issue(User user) {
        String rawToken = generateRawToken();

        RefreshToken refreshToken = new RefreshToken(
                user,
                hash(rawToken),
                Instant.now().plusSeconds(
                        jwtProperties.refreshExpirationSeconds()
                )
        );

        refreshTokenRepository.save(refreshToken);

        return rawToken;
    }

    /**
     * Refresh Token Rotation:
     *
     * 1. Kiểm tra token cũ.
     * 2. Thu hồi token cũ.
     * 3. Tạo token mới.
     */
    @Transactional
    public RefreshTokenRotation rotate(String rawToken) {
        Instant now = Instant.now();

        RefreshToken existingToken = refreshTokenRepository
                .findByTokenHash(hash(rawToken))
                .orElseThrow(InvalidRefreshTokenException::new);

        if (!existingToken.isUsableAt(now)) {
            throw new InvalidRefreshTokenException();
        }

        User user = existingToken.getUser();

        if (!user.isActive()) {
            throw new InvalidRefreshTokenException();
        }

        existingToken.revoke(now);

        String newRefreshToken = generateRawToken();

        RefreshToken replacement = new RefreshToken(
                user,
                hash(newRefreshToken),
                now.plusSeconds(
                        jwtProperties.refreshExpirationSeconds()
                )
        );

        refreshTokenRepository.save(replacement);

        return new RefreshTokenRotation(
                user,
                newRefreshToken
        );
    }

    /**
     * Logout có tính idempotent:
     * token không tồn tại cũng được coi là đã logout.
     */
    @Transactional
    public void revoke(String rawToken) {
        refreshTokenRepository
                .findByTokenHash(hash(rawToken))
                .ifPresent(token ->
                        token.revoke(Instant.now())
                );
    }

    @Transactional
    public void revokeAllForUser(UUID userId) {
        refreshTokenRepository.revokeAllActiveByUserId(
                userId,
                Instant.now()
        );
    }

    private String generateRawToken() {
        byte[] bytes = new byte[RAW_TOKEN_BYTES];
        secureRandom.nextBytes(bytes);

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes);
    }

    private String hash(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new InvalidRefreshTokenException();
        }

        try {
            MessageDigest digest =
                    MessageDigest.getInstance("SHA-256");

            byte[] hashed = digest.digest(
                    rawToken.getBytes(StandardCharsets.UTF_8)
            );

            return HexFormat.of().formatHex(hashed);

        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 không được hỗ trợ",
                    exception
            );
        }
    }
}