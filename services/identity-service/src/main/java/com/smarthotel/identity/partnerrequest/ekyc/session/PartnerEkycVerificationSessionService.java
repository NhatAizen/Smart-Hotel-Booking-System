package com.smarthotel.identity.partnerrequest.ekyc.session;

import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycPreverifyResponse;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationException;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationResult;
import com.smarthotel.identity.partnerrequest.media.PartnerDocumentStorageService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class PartnerEkycVerificationSessionService {

    private static final Duration RECEIPT_TTL = Duration.ofMinutes(10);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PartnerEkycVerificationSessionRepository repository;
    private final PartnerDocumentStorageService documentStorageService;

    public PartnerEkycVerificationSessionService(
            PartnerEkycVerificationSessionRepository repository,
            PartnerDocumentStorageService documentStorageService
    ) {
        this.repository = repository;
        this.documentStorageService = documentStorageService;
    }

    public PartnerEkycPreverifyResponse create(
            UUID userId,
            MultipartFile cccdFront,
            MultipartFile evidenceFrame,
            PartnerEkycVerificationResult result
    ) {
        if (result == null) {
            throw new PartnerEkycVerificationException(
                    "Dịch vụ eKYC không trả về kết quả xác minh"
            );
        }

        // Not-yet-passed is a normal state while the browser is continuously
        // scanning. Do not create a receipt and do not throw HTTP 422; return
        // the checks/guidance so the same challenge can be reused for the next
        // camera sample.
        if (!result.verified() || !result.livenessVerified() || !result.faceVerified()) {
            return new PartnerEkycPreverifyResponse(
                    false,
                    result.livenessVerified(),
                    result.faceVerified(),
                    result.faceSimilarity(),
                    result.faceMatchThreshold(),
                    null,
                    result.processedAt(),
                    null,
                    result.checks(),
                    retryGuidance(result)
            );
        }

        String receipt = newReceipt();
        Instant expiresAt = Instant.now().plus(RECEIPT_TTL);
        String evidencePath = null;
        try {
            // Lưu đúng frame camera thuộc request eKYC đã PASS, không nhận ảnh
            // bổ sung từ client sau khi xác minh. Đây là bằng chứng để System Admin
            // đối chiếu trực tiếp với ảnh CCCD trước khi duyệt đối tác.
            evidencePath = documentStorageService.storeEkycEvidence(
                    userId,
                    evidenceFrame
            );
            PartnerEkycVerificationSession session = new PartnerEkycVerificationSession(
                    userId,
                    sha256(receipt.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                    sha256(readBytes(cccdFront)),
                    evidencePath,
                    result,
                    expiresAt
            );
            repository.save(session);
        } catch (RuntimeException exception) {
            documentStorageService.deleteQuietly(evidencePath);
            throw exception;
        }

        return new PartnerEkycPreverifyResponse(
                true,
                result.livenessVerified(),
                result.faceVerified(),
                result.faceSimilarity(),
                result.faceMatchThreshold(),
                receipt,
                result.processedAt(),
                expiresAt,
                result.checks(),
                "Xác minh khuôn mặt thành công"
        );
    }

    private static String retryGuidance(PartnerEkycVerificationResult result) {
        Map<String, Boolean> checks = result.checks();
        if (checks != null) {
            if (Boolean.FALSE.equals(checks.get("idImageQualityPassed"))) {
                return "Ảnh chân dung trên CCCD chưa đủ rõ. Hãy tải lại ảnh CCCD mặt trước rõ hơn.";
            }
            if (Boolean.FALSE.equals(checks.get("liveImageQualityPassed"))) {
                return "Giữ mặt trong vòng, nhìn thẳng và đứng nơi đủ sáng. Hệ thống đang tự quét lại.";
            }
            if (Boolean.FALSE.equals(checks.get("allFrontPosePassed"))) {
                return "Hãy nhìn thẳng vào camera và giữ toàn bộ khuôn mặt trong vòng.";
            }
            if (Boolean.FALSE.equals(checks.get("liveFramesDifferent"))) {
                return "Giữ mặt tự nhiên và chớp mắt nhẹ. Hệ thống đang lấy mẫu camera mới.";
            }
            if (Boolean.FALSE.equals(checks.get("samePersonAcrossLiveFrames"))) {
                return "Chỉ một người được xuất hiện trong khung hình. Hãy giữ mặt ổn định.";
            }
            if (Boolean.FALSE.equals(checks.get("idFaceMatched"))) {
                return "Đang đối chiếu với ảnh CCCD. Hãy nhìn thẳng, bỏ khẩu trang/kính che mặt và giữ đủ sáng.";
            }
        }
        if (!result.livenessVerified()) {
            return "Chưa đủ tín hiệu camera sống. Hãy giữ mặt chính diện và chớp mắt tự nhiên.";
        }
        if (!result.faceVerified()) {
            return "Khuôn mặt chưa đủ tương đồng với CCCD. Hãy nhìn thẳng và giữ đủ sáng.";
        }
        return "Chưa đạt. Hệ thống đang tự động quét lại.";
    }

    public PartnerEkycVerificationResult consume(
            UUID userId,
            String receipt,
            MultipartFile cccdFront
    ) {
        return consumeWithEvidence(userId, receipt, cccdFront).result();
    }

    public ConsumedVerification consumeWithEvidence(
            UUID userId,
            String receipt,
            MultipartFile cccdFront
    ) {
        if (receipt == null || receipt.isBlank()) {
            throw new PartnerEkycVerificationException(
                    "Phiên xác minh khuôn mặt chưa hoàn tất. Vui lòng quét khuôn mặt lại."
            );
        }

        String tokenHash = sha256(
                receipt.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );
        PartnerEkycVerificationSession session = repository
                .findByUserIdAndReceiptTokenHash(userId, tokenHash)
                .orElseThrow(() -> new PartnerEkycVerificationException(
                        "Không tìm thấy phiên eKYC đã xác minh. Vui lòng quét khuôn mặt lại."
                ));

        Instant now = Instant.now();
        if (session.isConsumed()) {
            throw new PartnerEkycVerificationException(
                    "Phiên eKYC này đã được sử dụng. Vui lòng quét khuôn mặt lại."
            );
        }
        if (session.isExpired(now)) {
            throw new PartnerEkycVerificationException(
                    "Phiên eKYC đã hết hạn. Vui lòng quét khuôn mặt lại."
            );
        }

        String currentFrontHash = sha256(readBytes(cccdFront));
        if (!MessageDigest.isEqual(
                session.getCccdFrontSha256().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                currentFrontHash.getBytes(java.nio.charset.StandardCharsets.US_ASCII)
        )) {
            throw new PartnerEkycVerificationException(
                    "Ảnh CCCD mặt trước đã thay đổi sau khi xác minh khuôn mặt. Vui lòng eKYC lại."
            );
        }

        if (session.getEvidencePath() == null || session.getEvidencePath().isBlank()) {
            throw new PartnerEkycVerificationException(
                    "Phiên eKYC chưa có ảnh bằng chứng camera. Vui lòng quét khuôn mặt lại."
            );
        }

        session.consume(now);
        repository.save(session);
        return new ConsumedVerification(
                session.toResult(),
                session.getEvidencePath()
        );
    }

    public record ConsumedVerification(
            PartnerEkycVerificationResult result,
            String evidencePath
    ) {
    }

    private static String newReceipt() {
        byte[] value = new byte[32];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static byte[] readBytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new PartnerEkycVerificationException("Thiếu ảnh CCCD mặt trước");
        }
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new PartnerEkycVerificationException(
                    "Không đọc được ảnh CCCD mặt trước",
                    exception
            );
        }
    }

    private static String sha256(byte[] value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 không khả dụng", exception);
        }
    }
}
