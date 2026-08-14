package com.smarthotel.identity.partnerrequest.entity;

import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationResult;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "partner_requests")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PartnerRequest {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "applicant_type", nullable = false, length = 30)
    private PartnerApplicantType applicantType;

    @Column(name = "legal_name", nullable = false, length = 150)
    private String legalName;

    @Column(name = "representative_name", length = 150)
    private String representativeName;

    @Column(name = "identity_number", nullable = false, length = 50)
    private String identityNumber;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "business_phone", nullable = false, length = 30)
    private String businessPhone;

    @Column(name = "business_address", nullable = false, length = 255)
    private String businessAddress;

    /**
     * Legacy field from the first partner flow. New submissions use private CCCD images.
     */
    @Column(name = "document_url", length = 1000)
    private String documentUrl;

    @Column(name = "cccd_front_path", length = 500)
    private String cccdFrontPath;

    @Column(name = "cccd_back_path", length = 500)
    private String cccdBackPath;

    @Column(name = "ocr_identity_number", length = 12)
    private String ocrIdentityNumber;

    @Column(name = "ocr_full_name", length = 150)
    private String ocrFullName;

    @Column(name = "ocr_date_of_birth")
    private LocalDate ocrDateOfBirth;

    @Column(name = "ocr_identity_matched", nullable = false)
    private boolean ocrIdentityMatched;

    @Column(name = "ocr_name_matched", nullable = false)
    private boolean ocrNameMatched;

    @Column(name = "ocr_date_of_birth_matched", nullable = false)
    private boolean ocrDateOfBirthMatched;

    @Column(name = "ocr_verified", nullable = false)
    private boolean ocrVerified;

    @Column(name = "ocr_processed_at")
    private Instant ocrProcessedAt;

    @Column(name = "mrz_verified", nullable = false)
    private boolean mrzVerified;

    @Column(name = "mrz_format_valid", nullable = false)
    private boolean mrzFormatValid;

    @Column(name = "mrz_identity_number", length = 12)
    private String mrzIdentityNumber;

    @Column(name = "mrz_full_name", length = 150)
    private String mrzFullName;

    @Column(name = "mrz_date_of_birth")
    private LocalDate mrzDateOfBirth;

    @Column(name = "mrz_identity_matched", nullable = false)
    private boolean mrzIdentityMatched;

    @Column(name = "mrz_name_matched", nullable = false)
    private boolean mrzNameMatched;

    @Column(name = "mrz_date_of_birth_matched", nullable = false)
    private boolean mrzDateOfBirthMatched;

    @Column(name = "mrz_processed_at")
    private Instant mrzProcessedAt;

    @Column(name = "liveness_verified", nullable = false)
    private boolean livenessVerified;

    @Column(name = "face_verified", nullable = false)
    private boolean faceVerified;

    @Column(name = "face_similarity", precision = 7, scale = 5)
    private BigDecimal faceSimilarity;

    @Column(name = "ekyc_verified", nullable = false)
    private boolean ekycVerified;

    @Column(name = "ekyc_challenge_id", length = 64)
    private String ekycChallengeId;

    @Column(name = "ekyc_processed_at")
    private Instant ekycProcessedAt;

    @Column(name = "ekyc_evidence_path", length = 500)
    private String ekycEvidencePath;

    @Column(name = "note", length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PartnerRequestStatus status;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PartnerRequest(
            UUID userId,
            PartnerApplicantType applicantType,
            String legalName,
            String representativeName,
            String identityNumber,
            LocalDate dateOfBirth,
            String businessPhone,
            String businessAddress,
            String cccdFrontPath,
            String cccdBackPath,
            PartnerOcrResult ocrResult,
            PartnerEkycVerificationResult ekycResult,
            String ekycEvidencePath,
            String note
    ) {
        this.userId = userId;
        applyApplicationData(
                applicantType,
                legalName,
                representativeName,
                identityNumber,
                dateOfBirth,
                businessPhone,
                businessAddress,
                cccdFrontPath,
                cccdBackPath,
                ocrResult,
                ekycResult,
                ekycEvidencePath,
                note
        );
        this.status = PartnerRequestStatus.PENDING;
    }

    @PrePersist
    private void prePersist() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        updatedAt = Instant.now();
    }

    private void applyApplicationData(
            PartnerApplicantType applicantType,
            String legalName,
            String representativeName,
            String identityNumber,
            LocalDate dateOfBirth,
            String businessPhone,
            String businessAddress,
            String cccdFrontPath,
            String cccdBackPath,
            PartnerOcrResult ocrResult,
            PartnerEkycVerificationResult ekycResult,
            String ekycEvidencePath,
            String note
    ) {
        this.applicantType = applicantType;
        this.legalName = legalName;
        this.representativeName = representativeName;
        this.identityNumber = identityNumber;
        this.dateOfBirth = dateOfBirth;
        this.businessPhone = businessPhone;
        this.businessAddress = businessAddress;
        this.documentUrl = null;
        this.cccdFrontPath = cccdFrontPath;
        this.cccdBackPath = cccdBackPath;
        this.ocrIdentityNumber = ocrResult.identityNumber();
        this.ocrFullName = ocrResult.fullName();
        this.ocrDateOfBirth = ocrResult.dateOfBirth();
        this.ocrIdentityMatched = ocrResult.identityMatched();
        this.ocrNameMatched = ocrResult.nameMatched();
        this.ocrDateOfBirthMatched = ocrResult.dateOfBirthMatched();
        this.ocrVerified = ocrResult.verified();
        this.ocrProcessedAt = Instant.now();
        this.mrzVerified = ocrResult.mrzVerified();
        this.mrzFormatValid = ocrResult.mrzFormatValid();
        this.mrzIdentityNumber = ocrResult.mrzIdentityNumber();
        this.mrzFullName = ocrResult.mrzFullName();
        this.mrzDateOfBirth = ocrResult.mrzDateOfBirth();
        this.mrzIdentityMatched = ocrResult.mrzIdentityMatched();
        this.mrzNameMatched = ocrResult.mrzNameMatched();
        this.mrzDateOfBirthMatched = ocrResult.mrzDateOfBirthMatched();
        this.mrzProcessedAt = Instant.now();
        this.livenessVerified = ekycResult.livenessVerified();
        this.faceVerified = ekycResult.faceVerified();
        this.faceSimilarity = ekycResult.faceSimilarity();
        this.ekycVerified = ekycResult.verified();
        this.ekycChallengeId = ekycResult.challengeId();
        this.ekycProcessedAt = ekycResult.processedAt();
        this.ekycEvidencePath = ekycEvidencePath;
        this.note = note;
    }

    public void approve(UUID systemAdminId) {
        ensurePending();
        if (!ocrVerified) {
            throw new IllegalStateException(
                    "Hồ sơ chưa vượt qua xác minh OCR CCCD nên không thể phê duyệt"
            );
        }
        if (!mrzVerified || !mrzFormatValid
                || !mrzIdentityMatched || !mrzNameMatched || !mrzDateOfBirthMatched) {
            throw new IllegalStateException(
                    "Hồ sơ chưa vượt qua đối chiếu MRZ mặt sau CCCD nên không thể phê duyệt"
            );
        }
        if (!ekycVerified || !livenessVerified || !faceVerified) {
            throw new IllegalStateException(
                    "Hồ sơ chưa vượt qua eKYC (liveness + face match) nên không thể phê duyệt"
            );
        }
        if (ekycEvidencePath == null || ekycEvidencePath.isBlank()) {
            throw new IllegalStateException(
                    "Hồ sơ chưa có ảnh bằng chứng eKYC để System Admin đối chiếu"
            );
        }
        this.status = PartnerRequestStatus.APPROVED;
        this.rejectionReason = null;
        this.reviewedBy = systemAdminId;
        this.reviewedAt = Instant.now();
    }

    public void reject(UUID systemAdminId, String reason) {
        ensurePending();
        this.status = PartnerRequestStatus.REJECTED;
        this.rejectionReason = reason;
        this.reviewedBy = systemAdminId;
        this.reviewedAt = Instant.now();
    }

    private void ensurePending() {
        if (status != PartnerRequestStatus.PENDING) {
            throw new IllegalStateException(
                    "Chỉ yêu cầu đang chờ duyệt mới được xử lý"
            );
        }
    }
}
