package com.smarthotel.identity.partnerrequest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectPartnerRequest(

        @NotBlank(
                message = "LÃƒÂ½ do tÃ¡Â»Â« chÃ¡Â»â€˜i khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã¡Â»Æ’ trÃ¡Â»â€˜ng"
        )
        @Size(
                max = 500,
                message = "LÃƒÂ½ do tÃ¡Â»Â« chÃ¡Â»â€˜i tÃ¡Â»â€˜i Ã„â€˜a 500 kÃƒÂ½ tÃ¡Â»Â±"
        )
        String reason

) {
}