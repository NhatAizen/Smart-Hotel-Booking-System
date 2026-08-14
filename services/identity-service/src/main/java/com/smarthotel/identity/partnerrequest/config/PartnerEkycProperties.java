package com.smarthotel.identity.partnerrequest.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "partner-ekyc")
public record PartnerEkycProperties(
        String baseUrl,
        String internalApiKey,
        int connectTimeoutSeconds,
        int readTimeoutSeconds
) {
    public PartnerEkycProperties {
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "http://ekyc-service:8090";
        }
        if (internalApiKey == null || internalApiKey.isBlank()) {
            internalApiKey = "change-me-in-production";
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 5;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 30;
        }
    }
}
