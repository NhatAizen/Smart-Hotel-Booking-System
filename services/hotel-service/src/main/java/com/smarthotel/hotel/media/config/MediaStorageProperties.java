package com.smarthotel.hotel.media.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.media")
public record MediaStorageProperties(
        String uploadDir,
        String publicBaseUrl,
        long maxFileSizeBytes
) {
    public MediaStorageProperties {
        uploadDir = uploadDir == null || uploadDir.isBlank()
                ? "uploads"
                : uploadDir.trim();
        publicBaseUrl = publicBaseUrl == null || publicBaseUrl.isBlank()
                ? "http://localhost:8080/api/hotels/media"
                : publicBaseUrl.replaceAll("/+$", "");
        maxFileSizeBytes = maxFileSizeBytes <= 0
                ? 10L * 1024L * 1024L
                : maxFileSizeBytes;
    }
}
