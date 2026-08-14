package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmailRequest(

        @NotBlank(message = "Email khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng")
        @Email(message = "Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng")
        String email

) {
}