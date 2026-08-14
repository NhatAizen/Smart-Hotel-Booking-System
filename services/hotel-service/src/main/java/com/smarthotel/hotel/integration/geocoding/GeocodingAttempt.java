package com.smarthotel.hotel.integration.geocoding;

public record GeocodingAttempt(
        Status status,
        Double latitude,
        Double longitude,
        String displayName
) {
    public enum Status {
        SUCCESS,
        NOT_FOUND,
        UNAVAILABLE,
        DISABLED
    }

    public static GeocodingAttempt success(
            double latitude,
            double longitude,
            String displayName
    ) {
        return new GeocodingAttempt(
                Status.SUCCESS,
                latitude,
                longitude,
                displayName
        );
    }

    public static GeocodingAttempt notFound() {
        return new GeocodingAttempt(Status.NOT_FOUND, null, null, null);
    }

    public static GeocodingAttempt unavailable() {
        return new GeocodingAttempt(Status.UNAVAILABLE, null, null, null);
    }

    public static GeocodingAttempt disabled() {
        return new GeocodingAttempt(Status.DISABLED, null, null, null);
    }

    public boolean successful() {
        return status == Status.SUCCESS
                && latitude != null
                && longitude != null;
    }
}
