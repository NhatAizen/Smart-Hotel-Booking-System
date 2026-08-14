package com.smarthotel.identity.partnerrequest.ekyc.session;

import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "partner_ekyc_verification_sessions")
public class PartnerEkycVerificationSession {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "receipt_token_hash", nullable = false, unique = true, length = 64)
    private String receiptTokenHash;

    @Column(name = "cccd_front_sha256", nullable = false, length = 64)
    private String cccdFrontSha256;

    @Column(name = "challenge_id", nullable = false, length = 64)
    private String challengeId;

    @Column(name = "liveness_verified", nullable = false)
    private boolean livenessVerified;

    @Column(name = "face_verified", nullable = false)
    private boolean faceVerified;

    @Column(name = "face_similarity", precision = 7, scale = 5)
    private BigDecimal faceSimilarity;

    @Column(name = "face_match_threshold", precision = 7, scale = 5)
    private BigDecimal faceMatchThreshold;

    @Column(name = "evidence_path", length = 500)
    private String evidencePath;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected PartnerEkycVerificationSession() {
    }

    public PartnerEkycVerificationSession(
            UUID userId,
            String receiptTokenHash,
            String cccdFrontSha256,
            String evidencePath,
            PartnerEkycVerificationResult result,
            Instant expiresAt
    ) {
        this.userId = userId;
        this.receiptTokenHash = receiptTokenHash;
        this.cccdFrontSha256 = cccdFrontSha256;
        this.evidencePath = evidencePath;
        this.challengeId = result.challengeId();
        this.livenessVerified = result.livenessVerified();
        this.faceVerified = result.faceVerified();
        this.faceSimilarity = result.faceSimilarity();
        this.faceMatchThreshold = result.faceMatchThreshold();
        this.processedAt = result.processedAt();
        this.expiresAt = expiresAt;
    }

    @PrePersist
    private void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public boolean isExpired(Instant now) {
        return expiresAt == null || !expiresAt.isAfter(now);
    }

    public boolean isConsumed() {
        return consumedAt != null;
    }

    public void consume(Instant now) {
        this.consumedAt = now;
    }

    public String getCccdFrontSha256() {
        return cccdFrontSha256;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public String getEvidencePath() {
        return evidencePath;
    }

    public PartnerEkycVerificationResult toResult() {
        return new PartnerEkycVerificationResult(
                livenessVerified && faceVerified,
                livenessVerified,
                faceVerified,
                faceSimilarity,
                faceMatchThreshold,
                challengeId,
                processedAt,
                Map.of(
                        "liveness", livenessVerified,
                        "faceMatch", faceVerified,
                        "preverified", true
                )
        );
    }
}
