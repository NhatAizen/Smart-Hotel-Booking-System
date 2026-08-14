package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dá»¯ liá»‡u frontend gá»­i lÃªn khi Ä‘Äƒng kÃ½.
 */
public record RegisterRequest(

        @NotBlank(message = "Email khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        @Email(message = "Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng")
        @Size(
                max = 255,
                message = "Email khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ 255 kÃ½ tá»±"
        )
        String email,

        @NotBlank(message = "Máº­t kháº©u khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        @Size(
                min = 8,
                max = 72,
                message = "Máº­t kháº©u pháº£i tá»« 8 Ä‘áº¿n 72 kÃ½ tá»±"
        )
        String password,

        @NotBlank(message = "Há» tÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        @Size(
                min = 2,
                max = 150,
                message = "Há» tÃªn pháº£i tá»« 2 Ä‘áº¿n 150 kÃ½ tá»±"
        )
        String fullName

) {
}