package com.smarthotel.identity.partnerrequest.dto;

import com.smarthotel.identity.partnerrequest.entity.PartnerApplicantType;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record PartnerRequestResponse(
        UUID id,
        UUID userId,
        PartnerApplicantType applicantType,
        String legalName,
        String representativeName,
        String identityNumber,
        LocalDate dateOfBirth,
        String businessPhone,
        String businessAddress,
        String documentUrl,
        boolean cccdFrontAvailable,
        boolean cccdBackAvailable,
        String note,
        boolean ocrVerified,
        String ocrIdentityNumber,
        String ocrFullName,
        LocalDate ocrDateOfBirth,
        boolean ocrIdentityMatched,
        boolean ocrNameMatched,
        boolean ocrDateOfBirthMatched,
        Instant ocrProcessedAt,
        boolean mrzVerified,
        boolean mrzFormatValid,
        String mrzIdentityNumber,
        String mrzFullName,
        LocalDate mrzDateOfBirth,
        boolean mrzIdentityMatched,
        boolean mrzNameMatched,
        boolean mrzDateOfBirthMatched,
        Instant mrzProcessedAt,
        boolean livenessVerified,
        boolean faceVerified,
        BigDecimal faceSimilarity,
        boolean ekycVerified,
        String ekycChallengeId,
        Instant ekycProcessedAt,
        boolean ekycEvidenceAvailable,
        PartnerRequestStatus status,
        String rejectionReason,
        UUID reviewedBy,
        Instant reviewedAt,
        Instant createdAt,
        Instant updatedAt
) {

    public static PartnerRequestResponse from(PartnerRequest request) {
        return new PartnerRequestResponse(
                request.getId(),
                request.getUserId(),
                request.getApplicantType(),
                request.getLegalName(),
                request.getRepresentativeName(),
                request.getIdentityNumber(),
                request.getDateOfBirth(),
                request.getBusinessPhone(),
                request.getBusinessAddress(),
                request.getDocumentUrl(),
                request.getCccdFrontPath() != null && !request.getCccdFrontPath().isBlank(),
                request.getCccdBackPath() != null && !request.getCccdBackPath().isBlank(),
                request.getNote(),
                request.isOcrVerified(),
                request.getOcrIdentityNumber(),
                request.getOcrFullName(),
                request.getOcrDateOfBirth(),
                request.isOcrIdentityMatched(),
                request.isOcrNameMatched(),
                request.isOcrDateOfBirthMatched(),
                request.getOcrProcessedAt(),
                request.isMrzVerified(),
                request.isMrzFormatValid(),
                request.getMrzIdentityNumber(),
                request.getMrzFullName(),
                request.getMrzDateOfBirth(),
                request.isMrzIdentityMatched(),
                request.isMrzNameMatched(),
                request.isMrzDateOfBirthMatched(),
                request.getMrzProcessedAt(),
                request.isLivenessVerified(),
                request.isFaceVerified(),
                request.getFaceSimilarity(),
                request.isEkycVerified(),
                request.getEkycChallengeId(),
                request.getEkycProcessedAt(),
                request.getEkycEvidencePath() != null && !request.getEkycEvidencePath().isBlank(),
                request.getStatus(),
                request.getRejectionReason(),
                request.getReviewedBy(),
                request.getReviewedAt(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }
}
