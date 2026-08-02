package com.smarthotel.identity.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.mail")
public record AppMailProperties(
        String from,
        String publicBaseUrl,
        long verificationExpirationSeconds,
        long passwordResetExpirationSeconds
) {
}