package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.*;

/** Incoming coordinates are presentation data only; the server resolves query again. */
public record NearbyLocation(@NotBlank @Size(max=160) String query,
        @DecimalMin("0.1") @DecimalMax("100") Double radiusKm,
        @Size(max=250) String displayName, Double latitude, Double longitude,
        @Size(max=250) String sourceUrl) {
    public static NearbyLocation requested(String query, Double radius) {
        return new NearbyLocation(query, radius == null ? 5.0 : radius, null, null, null, null);
    }
}
