package com.smarthotel.identity.partnerrequest.ekyc;

import java.time.Instant;
import java.util.List;

public record PartnerEkycChallengeResponse(
        String challengeId,
        String challengeToken,
        List<String> challenges,
        Instant expiresAt
) {
}
