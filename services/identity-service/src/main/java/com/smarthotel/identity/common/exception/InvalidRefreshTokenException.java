package com.smarthotel.identity.common.exception;

public class InvalidRefreshTokenException extends RuntimeException {

    public InvalidRefreshTokenException() {
        super("Refresh token khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n");
    }
}