package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(

        @NotBlank(message = "Refresh token khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        String refreshToken

) {
}