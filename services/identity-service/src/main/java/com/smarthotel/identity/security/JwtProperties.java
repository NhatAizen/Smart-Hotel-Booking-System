package com.smarthotel.identity.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        String secret,
        String issuer,
        long expirationSeconds,
        long refreshExpirationSeconds
) {
}