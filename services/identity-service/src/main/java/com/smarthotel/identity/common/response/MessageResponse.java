package com.smarthotel.identity.common.response;

public record MessageResponse(
        boolean success,
        String message
) {

    public static MessageResponse success(String message) {
        return new MessageResponse(true, message);
    }
}