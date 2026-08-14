package com.smarthotel.identity.partnerrequest.ekyc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

public record PartnerEkycPreverifyResponse(
        boolean verified,
        boolean livenessVerified,
        boolean faceVerified,
        BigDecimal faceSimilarity,
        BigDecimal faceMatchThreshold,
        String verificationReceipt,
        Instant processedAt,
        Instant expiresAt,
        Map<String, Boolean> checks,
        String guidance
) {
}
