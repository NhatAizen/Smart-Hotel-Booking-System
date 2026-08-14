package com.smarthotel.identity.accounttoken.service;

import com.smarthotel.identity.accounttoken.entity.AccountActionToken;
import com.smarthotel.identity.accounttoken.entity.AccountTokenType;
import com.smarthotel.identity.accounttoken.repository.AccountActionTokenRepository;
import com.smarthotel.identity.common.exception.InvalidAccountTokenException;
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

@Service
public class AccountActionTokenService {

    private static final int RAW_TOKEN_BYTES = 48;

    private final AccountActionTokenRepository tokenRepository;
    private final SecureRandom secureRandom;

    public AccountActionTokenService(
            AccountActionTokenRepository tokenRepository
    ) {
        this.tokenRepository = tokenRepository;
        this.secureRandom = new SecureRandom();
    }

    /**
     * Táº¡o token má»›i.
     *
     * Token cÅ© cÃ¹ng loáº¡i cá»§a user sáº½ bá»‹ vÃ´ hiá»‡u hÃ³a.
     * Database chá»‰ lÆ°u SHA-256 hash.
     */
    @Transactional
    public String issue(
            User user,
            AccountTokenType tokenType,
            long expirationSeconds
    ) {
        Instant now = Instant.now();

        tokenRepository.invalidateActiveTokens(
                user.getId(),
                tokenType,
                now
        );

        String rawToken = generateRawToken();

        AccountActionToken token =
                new AccountActionToken(
                        user,
                        tokenType,
                        hash(rawToken),
                        now.plusSeconds(expirationSeconds)
                );

        tokenRepository.save(token);

        return rawToken;
    }

    /**
     * Kiá»ƒm tra vÃ  sá»­ dá»¥ng token Ä‘Ãºng má»™t láº§n.
     */
    @Transactional
    public User consume(
            String rawToken,
            AccountTokenType expectedType
    ) {
        Instant now = Instant.now();

        AccountActionToken token = tokenRepository
                .findByTokenHashAndTokenType(
                        hash(rawToken),
                        expectedType
                )
                .orElseThrow(
                        InvalidAccountTokenException::new
                );

        if (!token.isUsableAt(now)) {
            throw new InvalidAccountTokenException();
        }

        User user = token.getUser();

        if (!user.isActive()) {
            throw new InvalidAccountTokenException();
        }

        token.markUsed(now);

        return user;
    }

    @Transactional
    public void invalidateAll(
            User user,
            AccountTokenType tokenType
    ) {
        tokenRepository.invalidateActiveTokens(
                user.getId(),
                tokenType,
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
            throw new InvalidAccountTokenException();
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
                    "SHA-256 khÃ´ng Ä‘Æ°á»£c há»— trá»£",
                    exception
            );
        }
    }
}