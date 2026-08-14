package com.smarthotel.hotel.integration.geocoding;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "clients.nominatim")
public record NominatimProperties(
        boolean enabled,
        String baseUrl,
        String userAgent,
        long minIntervalMs,
        int connectTimeoutMs,
        int readTimeoutMs
) {
    public NominatimProperties {
        baseUrl = baseUrl == null || baseUrl.isBlank()
                ? "https://nominatim.openstreetmap.org"
                : baseUrl.replaceAll("/+$", "");
        userAgent = userAgent == null || userAgent.isBlank()
                ? "EnziuRooms/1.0 (Smart Hotel Booking System student project)"
                : userAgent.trim();
        minIntervalMs = Math.max(minIntervalMs, 1100L);
        connectTimeoutMs = connectTimeoutMs <= 0 ? 5000 : connectTimeoutMs;
        readTimeoutMs = readTimeoutMs <= 0 ? 10000 : readTimeoutMs;
    }
}
