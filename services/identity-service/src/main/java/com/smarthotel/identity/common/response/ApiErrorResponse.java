package com.smarthotel.identity.common.response;

import java.time.Instant;
import java.util.Map;

public record ApiErrorResponse(
        boolean success,
        int status,
        String code,
        String message,
        String path,
        Instant timestamp,
        Map<String, String> validationErrors,
        Long retryAfterSeconds
) {

    public static ApiErrorResponse of(int status, String code, String message, String path) {
        return new ApiErrorResponse(false, status, code, message, path, Instant.now(), null, null);
    }

    public static ApiErrorResponse validation(
            int status, String code, String message, String path, Map<String, String> validationErrors
    ) {
        return new ApiErrorResponse(false, status, code, message, path, Instant.now(), validationErrors, null);
    }

    public static ApiErrorResponse retryAfter(
            int status, String code, String message, String path, long retryAfterSeconds
    ) {
        return new ApiErrorResponse(
                false, status, code, message, path, Instant.now(), null, Math.max(1, retryAfterSeconds)
        );
    }
}
