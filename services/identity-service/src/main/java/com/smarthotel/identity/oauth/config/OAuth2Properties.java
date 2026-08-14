package com.smarthotel.identity.oauth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.oauth2")
public record OAuth2Properties(
        String frontendCallbackUrl,
        long authorizationCodeExpirationSeconds
) {
}
