package com.smarthotel.identity.partnerrequest.ekyc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

public record PartnerEkycVerificationResult(
        boolean verified,
        boolean livenessVerified,
        boolean faceVerified,
        BigDecimal faceSimilarity,
        BigDecimal faceMatchThreshold,
        String challengeId,
        Instant processedAt,
        Map<String, Boolean> checks
) {
}
