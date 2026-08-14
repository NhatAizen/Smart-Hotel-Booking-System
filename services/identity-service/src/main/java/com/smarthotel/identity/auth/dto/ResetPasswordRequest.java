package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(

        @NotBlank(message = "Token khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        String token,

        @NotBlank(message = "Máº­t kháº©u má»›i khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        @Size(
                min = 8,
                max = 72,
                message = "Máº­t kháº©u má»›i pháº£i tá»« 8 Ä‘áº¿n 72 kÃ½ tá»±"
        )
        String newPassword

) {
}