package com.smarthotel.identity.partnerrequest.service;

import com.smarthotel.identity.integration.notification.NotificationClient;
import com.smarthotel.identity.partnerrequest.dto.PartnerOcrPrecheckRequest;
import com.smarthotel.identity.partnerrequest.dto.PartnerOcrPrecheckResponse;
import com.smarthotel.identity.partnerrequest.dto.PartnerRequestResponse;
import com.smarthotel.identity.partnerrequest.dto.SubmitPartnerRequest;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycChallengeResponse;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycPreverifyResponse;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycClient;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationResult;
import com.smarthotel.identity.partnerrequest.ekyc.session.PartnerEkycVerificationSessionService;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerApplicantType;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus;
import com.smarthotel.identity.partnerrequest.media.PartnerDocumentStorageService;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrResult;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrService;
import com.smarthotel.identity.partnerrequest.repository.PartnerRequestRepository;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.springframework.core.io.Resource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class PartnerRequestService {

    private final PartnerRequestRepository partnerRequestRepository;
    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;
    private final NotificationClient notificationClient;
    private final PartnerOcrService ocrService;
    private final PartnerEkycClient ekycClient;
    private final PartnerEkycVerificationSessionService ekycSessionService;
    private final PartnerDocumentStorageService documentStorageService;
    private final EntityManager entityManager;

    public PartnerRequestService(
            PartnerRequestRepository partnerRequestRepository,
            UserRepository userRepository,
            RefreshTokenService refreshTokenService,
            NotificationClient notificationClient,
            PartnerOcrService ocrService,
            PartnerEkycClient ekycClient,
            PartnerEkycVerificationSessionService ekycSessionService,
            PartnerDocumentStorageService documentStorageService,
            EntityManager entityManager
    ) {
        this.partnerRequestRepository = partnerRequestRepository;
        this.userRepository = userRepository;
        this.refreshTokenService = refreshTokenService;
        this.notificationClient = notificationClient;
        this.ocrService = ocrService;
        this.ekycClient = ekycClient;
        this.ekycSessionService = ekycSessionService;
        this.documentStorageService = documentStorageService;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public PartnerOcrPrecheckResponse verifyOcr(
            UUID userId,
            PartnerOcrPrecheckRequest request,
            MultipartFile cccdFront,
            MultipartFile cccdBack
    ) {
        User user = findUser(userId);
        if (!user.isActive()) {
            throw new AccessDeniedException("Tài khoản đã bị khóa");
        }
        if (user.getRole() != UserRole.CUSTOMER) {
            throw new AccessDeniedException(
                    "Chỉ Customer mới được xác minh CCCD đăng ký đối tác"
            );
        }

        String identityNumber = normalizeIdentity(request.identityNumber());
        if (partnerRequestRepository.existsByIdentityNumberAndUserIdNot(
                identityNumber,
                userId
        )) {
            throw new IllegalArgumentException(
                    "Số CCCD này đã được sử dụng trong một hồ sơ đối tác khác"
            );
        }

        PartnerOcrResult result = ocrService.verify(
                cccdFront,
                cccdBack,
                identityNumber,
                normalize(request.fullName()),
                request.dateOfBirth()
        );
        return PartnerOcrPrecheckResponse.from(result);
    }

    @Transactional(readOnly = true)
    public PartnerEkycChallengeResponse createEkycChallenge(UUID userId) {
        User user = findUser(userId);
        if (!user.isActive()) {
            throw new AccessDeniedException("Tài khoản đã bị khóa");
        }
        if (user.getRole() != UserRole.CUSTOMER) {
            throw new AccessDeniedException(
                    "Chỉ Customer mới được thực hiện eKYC đăng ký đối tác"
            );
        }
        return ekycClient.createChallenge(userId);
    }

    @Transactional
    public PartnerEkycPreverifyResponse verifyEkyc(
            UUID userId,
            String challengeToken,
            MultipartFile cccdFront,
            MultipartFile livenessFrame0,
            MultipartFile livenessFrame1,
            MultipartFile livenessFrame2
    ) {
        User user = findUser(userId);
        if (!user.isActive()) {
            throw new AccessDeniedException("Tài khoản đã bị khóa");
        }
        if (user.getRole() != UserRole.CUSTOMER) {
            throw new AccessDeniedException(
                    "Chỉ Customer mới được thực hiện eKYC đăng ký đối tác"
            );
        }
        if (challengeToken == null || challengeToken.isBlank()) {
            throw new IllegalArgumentException("Thiếu phiên thử thách eKYC");
        }

        PartnerEkycVerificationResult result = ekycClient.verify(
                userId,
                challengeToken.trim(),
                cccdFront,
                requireFrame(livenessFrame0, "ảnh chính diện 1"),
                requireFrame(livenessFrame1, "ảnh chính diện 2"),
                requireFrame(livenessFrame2, "ảnh chính diện 3")
        );
        return ekycSessionService.create(
                userId,
                cccdFront,
                livenessFrame0,
                result
        );
    }

    @Transactional
    public PartnerRequestResponse submit(
            UUID userId,
            SubmitPartnerRequest request,
            MultipartFile cccdFront,
            MultipartFile cccdBack,
            String ekycReceipt,
            MultipartFile managementProof,
            MultipartFile businessLicense
    ) {
        User user = findUserForUpdate(userId);
        PartnerDocumentStorageService.StoredDocuments stored = null;
        PartnerDocumentStorageService.StoredDocument storedManagementProof = null;
        PartnerDocumentStorageService.StoredDocument storedBusinessLicense = null;
        PartnerRequest resubmittedRequest = null;
        String oldFrontPath = null;
        String oldBackPath = null;
        String oldEvidencePath = null;
        String oldManagementProofPath = null;
        String oldBusinessLicensePath = null;

        try {
            if (!user.isActive()) {
                throw new AccessDeniedException("Tài khoản đã bị khóa");
            }
            if (user.getRole() != UserRole.CUSTOMER) {
                throw new AccessDeniedException(
                        "Chỉ Customer mới được gửi yêu cầu trở thành đối tác"
                );
            }

            if (partnerRequestRepository.existsByUserIdAndStatus(
                    userId,
                    PartnerRequestStatus.PENDING
            )) {
                throw new IllegalStateException("Bạn đã có một yêu cầu đang chờ duyệt");
            }

            Optional<PartnerRequest> latestRequest = partnerRequestRepository
                    .findFirstByUserIdOrderByCreatedAtDescIdDesc(userId);
            if (latestRequest.isPresent()
                    && latestRequest.get().getStatus() == PartnerRequestStatus.NEED_MORE_INFO) {
                resubmittedRequest = latestRequest.get();
                oldFrontPath = resubmittedRequest.getCccdFrontPath();
                oldBackPath = resubmittedRequest.getCccdBackPath();
                oldEvidencePath = resubmittedRequest.getEkycEvidencePath();
                oldManagementProofPath = resubmittedRequest.getManagementProofPath();
                oldBusinessLicensePath = resubmittedRequest.getBusinessLicensePath();
            }

            validateApplicationDocuments(request, managementProof, businessLicense, resubmittedRequest);

            String identityNumber = normalizeIdentity(request.identityNumber());
            if (partnerRequestRepository.existsByIdentityNumberAndUserIdNot(
                    identityNumber,
                    userId
            )) {
                throw new IllegalArgumentException(
                        "Số CCCD này đã được sử dụng trong một hồ sơ đối tác khác"
                );
            }

            String representativeName = normalize(request.representativeName());

            PartnerOcrResult ocrResult = ocrService.verify(
                    cccdFront,
                    cccdBack,
                    identityNumber,
                    representativeName,
                    request.dateOfBirth()
            );

            PartnerEkycVerificationSessionService.ConsumedVerification consumedEkyc =
                    ekycSessionService.consumeWithEvidence(
                            userId,
                            ekycReceipt,
                            cccdFront
                    );
            PartnerEkycVerificationResult ekycResult = consumedEkyc.result();

            stored = documentStorageService.storePair(userId, cccdFront, cccdBack);

            if (managementProof != null && !managementProof.isEmpty()) {
                storedManagementProof = documentStorageService.storeSupportingDocument(
                        userId,
                        "management-proof",
                        managementProof
                );
            }
            if (businessLicense != null && !businessLicense.isEmpty()) {
                storedBusinessLicense = documentStorageService.storeSupportingDocument(
                        userId,
                        "business-license",
                        businessLicense
                );
            }

            PartnerRequest.SupportingDocument managementDocument = storedManagementProof != null
                    ? toEntityDocument(storedManagementProof)
                    : existingManagementProof(resubmittedRequest, request.applicantType());
            PartnerRequest.SupportingDocument businessDocument = storedBusinessLicense != null
                    ? toEntityDocument(storedBusinessLicense)
                    : existingBusinessLicense(resubmittedRequest, request.applicantType());

            String contactEmail = normalize(request.contactEmail()).toLowerCase(Locale.ROOT);
            String businessTaxCode = normalizeBusinessTaxCode(
                    request.applicantType(),
                    request.businessTaxCode()
            );

            PartnerRequest partnerRequest;
            if (resubmittedRequest == null) {
                partnerRequest = new PartnerRequest(
                        userId,
                        request.applicantType(),
                        normalize(request.legalName()),
                        representativeName,
                        identityNumber,
                        request.dateOfBirth(),
                        normalize(request.businessPhone()),
                        normalize(request.businessAddress()),
                        contactEmail,
                        businessTaxCode,
                        businessDocument,
                        managementDocument,
                        stored.frontPath(),
                        stored.backPath(),
                        ocrResult,
                        ekycResult,
                        consumedEkyc.evidencePath(),
                        normalizeNullable(request.note())
                );
            } else {
                partnerRequest = resubmittedRequest;
                partnerRequest.resubmit(
                        request.applicantType(),
                        normalize(request.legalName()),
                        representativeName,
                        identityNumber,
                        request.dateOfBirth(),
                        normalize(request.businessPhone()),
                        normalize(request.businessAddress()),
                        contactEmail,
                        businessTaxCode,
                        businessDocument,
                        managementDocument,
                        stored.frontPath(),
                        stored.backPath(),
                        ocrResult,
                        ekycResult,
                        consumedEkyc.evidencePath(),
                        normalizeNullable(request.note())
                );
            }

            PartnerRequest savedRequest = partnerRequestRepository.saveAndFlush(partnerRequest);

            deleteReplacedDocument(oldFrontPath, stored.frontPath());
            deleteReplacedDocument(oldBackPath, stored.backPath());
            deleteReplacedDocument(oldEvidencePath, consumedEkyc.evidencePath());
            deleteReplacedDocument(
                    oldManagementProofPath,
                    managementDocument == null ? null : managementDocument.path()
            );
            deleteReplacedDocument(
                    oldBusinessLicensePath,
                    businessDocument == null ? null : businessDocument.path()
            );

            notificationClient.sendRole(
                    "SYSTEM_ADMIN",
                    resubmittedRequest == null
                            ? "Có yêu cầu đối tác mới"
                            : "Hồ sơ đối tác đã được bổ sung",
                    savedRequest.getLegalName()
                            + (resubmittedRequest == null
                            ? " vừa gửi hồ sơ đăng ký đối tác để xét duyệt."
                            : " vừa cập nhật và gửi lại hồ sơ đối tác."),
                    "PARTNER_REQUEST",
                    "PARTNER",
                    "/admin/partner-requests"
            );

            notificationClient.sendUser(
                    userId,
                    "Hồ sơ đối tác đã được tiếp nhận",
                    "EnziuRooms đã tiếp nhận hồ sơ của bạn và sẽ thông báo khi có kết quả xét duyệt.",
                    "PARTNER_REQUEST",
                    "PARTNER",
                    "/customer/partner"
            );

            return PartnerRequestResponse.from(savedRequest);
        } catch (RuntimeException exception) {
            if (stored != null) {
                documentStorageService.deleteQuietly(stored.frontPath());
                documentStorageService.deleteQuietly(stored.backPath());
            }
            if (storedManagementProof != null) {
                documentStorageService.deleteQuietly(storedManagementProof.path());
            }
            if (storedBusinessLicense != null) {
                documentStorageService.deleteQuietly(storedBusinessLicense.path());
            }
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public PartnerRequestResponse getMine(UUID userId) {
        User user = findUser(userId);
        if (user.getRole() == UserRole.SYSTEM_ADMIN) {
            throw new AccessDeniedException("System Admin không có hồ sơ đối tác");
        }

        PartnerRequest request = findLatestCurrentRequest(user);
        return PartnerRequestResponse.from(request);
    }

    @Transactional(readOnly = true)
    public List<PartnerRequestResponse> getByStatus(
            UUID systemAdminId,
            PartnerRequestStatus status
    ) {
        requireSystemAdmin(systemAdminId);
        PartnerRequestStatus effectiveStatus = status == null
                ? PartnerRequestStatus.PENDING
                : status;

        return partnerRequestRepository
                .findAllByStatusOrderByCreatedAtAsc(effectiveStatus)
                .stream()
                .map(PartnerRequestResponse::from)
                .toList();
    }

    @Transactional
    public PartnerRequestResponse approve(UUID systemAdminId, UUID requestId) {
        requireSystemAdminForUpdate(systemAdminId);
        UUID applicantId = findPartnerRequestUserId(requestId);
        User applicant = findUserForUpdate(applicantId);
        PartnerRequest partnerRequest = findPartnerRequestForUpdate(requestId);

        if (!partnerRequest.getUserId().equals(applicantId)) {
            throw new IllegalStateException("Chủ hồ sơ đối tác đã thay đổi bất thường");
        }

        if (!applicant.isActive()) {
            throw new IllegalStateException(
                    "Không thể duyệt tài khoản đang bị khóa"
            );
        }
        if (applicant.getRole() != UserRole.CUSTOMER) {
            throw new IllegalStateException(
                    "Tài khoản không còn là Customer"
            );
        }
        if (!partnerRequest.isOcrVerified()) {
            throw new IllegalStateException(
                    "Hồ sơ chưa xác minh OCR CCCD nên không thể phê duyệt"
            );
        }
        if (!partnerRequest.isEkycVerified()) {
            throw new IllegalStateException(
                    "Hồ sơ chưa vượt qua liveness và face match nên không thể phê duyệt"
            );
        }
        if (partnerRequest.getEkycEvidencePath() == null
                || partnerRequest.getEkycEvidencePath().isBlank()) {
            throw new IllegalStateException(
                    "Hồ sơ chưa có ảnh bằng chứng eKYC. Yêu cầu người dùng quét khuôn mặt lại trước khi duyệt."
            );
        }

        partnerRequest.approve(systemAdminId);
        entityManager.flush();
        setRoleChangeAuditContext(
                systemAdminId,
                "Phê duyệt hồ sơ đăng ký đối tác",
                partnerRequest.getId()
        );
        applicant.promoteToHotelAdmin();
        refreshTokenService.revokeAllForUser(applicant.getId());

        notificationClient.sendUser(
                applicant.getId(),
                "Hồ sơ đối tác đã được phê duyệt",
                "Chúc mừng! Tài khoản của bạn đã được nâng cấp thành Hotel Admin. Hãy đăng nhập lại để bắt đầu quản lý khách sạn.",
                "PARTNER_REQUEST",
                "PARTNER",
                "/login"
        );

        return PartnerRequestResponse.from(partnerRequest);
    }

    @Transactional
    public PartnerRequestResponse reject(
            UUID systemAdminId,
            UUID requestId,
            String reason
    ) {
        requireSystemAdminForUpdate(systemAdminId);
        UUID applicantId = findPartnerRequestUserId(requestId);
        findUserForUpdate(applicantId);
        PartnerRequest partnerRequest = findPartnerRequestForUpdate(requestId);
        if (!partnerRequest.getUserId().equals(applicantId)) {
            throw new IllegalStateException("Chủ hồ sơ đối tác đã thay đổi bất thường");
        }
        String normalizedReason = normalize(reason);

        partnerRequest.reject(systemAdminId, normalizedReason);

        notificationClient.sendUser(
                partnerRequest.getUserId(),
                "Hồ sơ đối tác đã bị từ chối",
                "Hồ sơ đối tác không được phê duyệt. Lý do: " + normalizedReason,
                "PARTNER_REQUEST",
                "PARTNER",
                "/customer/partner"
        );

        return PartnerRequestResponse.from(partnerRequest);
    }

    @Transactional
    public PartnerRequestResponse requestMoreInfo(
            UUID systemAdminId,
            UUID requestId,
            String reason
    ) {
        requireSystemAdminForUpdate(systemAdminId);
        UUID applicantId = findPartnerRequestUserId(requestId);
        findUserForUpdate(applicantId);
        PartnerRequest partnerRequest = findPartnerRequestForUpdate(requestId);
        if (!partnerRequest.getUserId().equals(applicantId)) {
            throw new IllegalStateException("Chủ hồ sơ đối tác đã thay đổi bất thường");
        }

        String normalizedReason = normalize(reason);
        partnerRequest.requestMoreInfo(systemAdminId, normalizedReason);

        notificationClient.sendUser(
                partnerRequest.getUserId(),
                "Hồ sơ đối tác cần bổ sung",
                "EnziuRooms cần bạn bổ sung hồ sơ. Lý do: " + normalizedReason,
                "PARTNER_REQUEST",
                "PARTNER",
                "/customer/partner"
        );

        return PartnerRequestResponse.from(partnerRequest);
    }

    @Transactional(readOnly = true)
    public PartnerDocumentResource getMyDocument(UUID userId, String side) {
        User user = findUser(userId);
        if (user.getRole() == UserRole.SYSTEM_ADMIN) {
            throw new AccessDeniedException("System Admin không có hồ sơ đối tác");
        }
        PartnerRequest request = findLatestCurrentRequest(user);
        return loadDocument(request, side);
    }

    @Transactional(readOnly = true)
    public PartnerDocumentResource getAdminDocument(
            UUID systemAdminId,
            UUID requestId,
            String side
    ) {
        requireSystemAdmin(systemAdminId);
        return loadDocument(findPartnerRequest(requestId), side);
    }

    @Transactional(readOnly = true)
    public PartnerDocumentResource getAdminEkycEvidence(
            UUID systemAdminId,
            UUID requestId
    ) {
        requireSystemAdmin(systemAdminId);
        PartnerRequest request = findPartnerRequest(requestId);
        if (!request.isEkycVerified()) {
            throw new IllegalArgumentException(
                    "Hồ sơ chưa có eKYC thành công"
            );
        }
        String path = request.getEkycEvidencePath();
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException(
                    "Hồ sơ chưa có ảnh bằng chứng eKYC. Đây có thể là hồ sơ cũ; hãy yêu cầu người dùng quét lại."
            );
        }
        Resource resource = documentStorageService.load(path);
        String contentType = documentStorageService.contentType(path);
        return new PartnerDocumentResource(resource, contentType);
    }

    @Transactional(readOnly = true)
    public PartnerDocumentResource getMySupportingDocument(
            UUID userId,
            String documentType
    ) {
        User user = findUser(userId);
        if (user.getRole() == UserRole.SYSTEM_ADMIN) {
            throw new AccessDeniedException("System Admin không có hồ sơ đối tác");
        }
        return loadSupportingDocument(findLatestCurrentRequest(user), documentType);
    }

    @Transactional(readOnly = true)
    public PartnerDocumentResource getAdminSupportingDocument(
            UUID systemAdminId,
            UUID requestId,
            String documentType
    ) {
        requireSystemAdmin(systemAdminId);
        return loadSupportingDocument(findPartnerRequest(requestId), documentType);
    }

    private PartnerDocumentResource loadDocument(PartnerRequest request, String side) {
        String normalizedSide = side == null ? "" : side.trim().toLowerCase(Locale.ROOT);
        String path = switch (normalizedSide) {
            case "front" -> request.getCccdFrontPath();
            case "back" -> request.getCccdBackPath();
            default -> throw new IllegalArgumentException("Mặt CCCD không hợp lệ");
        };

        Resource resource = documentStorageService.load(path);
        String contentType = documentStorageService.contentType(path);
        return new PartnerDocumentResource(resource, contentType);
    }

    private PartnerDocumentResource loadSupportingDocument(
            PartnerRequest request,
            String documentType
    ) {
        String normalizedType = documentType == null
                ? ""
                : documentType.trim().toLowerCase(Locale.ROOT);
        String path = switch (normalizedType) {
            case "management-proof" -> request.getManagementProofPath();
            case "business-license" -> request.getBusinessLicensePath();
            default -> throw new IllegalArgumentException("Loại giấy tờ không hợp lệ");
        };
        Resource resource = documentStorageService.load(path);
        return new PartnerDocumentResource(resource, documentStorageService.contentType(path));
    }

    private void validateApplicationDocuments(
            SubmitPartnerRequest request,
            MultipartFile managementProof,
            MultipartFile businessLicense,
            PartnerRequest resubmittedRequest
    ) {
        if (managementProof != null && !managementProof.isEmpty()) {
            documentStorageService.validateSupportingDocument(managementProof);
        }
        if (businessLicense != null && !businessLicense.isEmpty()) {
            documentStorageService.validateSupportingDocument(businessLicense);
        }

        if (request.applicantType() == PartnerApplicantType.BUSINESS) {
            normalizeBusinessTaxCode(request.applicantType(), request.businessTaxCode());
            boolean existingLicense = resubmittedRequest != null
                    && resubmittedRequest.getBusinessLicensePath() != null
                    && !resubmittedRequest.getBusinessLicensePath().isBlank();
            if ((businessLicense == null || businessLicense.isEmpty()) && !existingLicense) {
                throw new IllegalArgumentException(
                        "Doanh nghiệp hoặc hộ kinh doanh phải cung cấp giấy chứng nhận đăng ký"
                );
            }
        }
    }

    private String normalizeBusinessTaxCode(
            PartnerApplicantType applicantType,
            String value
    ) {
        if (applicantType != PartnerApplicantType.BUSINESS) return null;
        String normalized = value == null ? "" : value.replaceAll("[^0-9]", "");
        if (!normalized.matches("\\d{10}|\\d{13}")) {
            throw new IllegalArgumentException("Mã số thuế phải gồm 10 hoặc 13 chữ số");
        }
        return normalized;
    }

    private PartnerRequest.SupportingDocument toEntityDocument(
            PartnerDocumentStorageService.StoredDocument document
    ) {
        return new PartnerRequest.SupportingDocument(
                document.path(),
                document.originalName(),
                document.contentType(),
                document.size()
        );
    }

    private PartnerRequest.SupportingDocument existingManagementProof(
            PartnerRequest request,
            PartnerApplicantType applicantType
    ) {
        if (request == null || applicantType != PartnerApplicantType.INDIVIDUAL
                || request.getManagementProofPath() == null) {
            return null;
        }
        return new PartnerRequest.SupportingDocument(
                request.getManagementProofPath(),
                request.getManagementProofName(),
                request.getManagementProofContentType(),
                request.getManagementProofSize() == null ? 0L : request.getManagementProofSize()
        );
    }

    private PartnerRequest.SupportingDocument existingBusinessLicense(
            PartnerRequest request,
            PartnerApplicantType applicantType
    ) {
        if (request == null || applicantType != PartnerApplicantType.BUSINESS
                || request.getBusinessLicensePath() == null) {
            return null;
        }
        return new PartnerRequest.SupportingDocument(
                request.getBusinessLicensePath(),
                request.getBusinessLicenseName(),
                request.getBusinessLicenseContentType(),
                request.getBusinessLicenseSize() == null ? 0L : request.getBusinessLicenseSize()
        );
    }

    private void deleteReplacedDocument(String oldPath, String newPath) {
        if (oldPath != null && !oldPath.isBlank() && !oldPath.equals(newPath)) {
            documentStorageService.deleteQuietly(oldPath);
        }
    }

    private void requireSystemAdmin(UUID userId) {
        User user = findUser(userId);
        requireSystemAdmin(user);
    }

    private void requireSystemAdminForUpdate(UUID userId) {
        User user = findUserForUpdate(userId);
        requireSystemAdmin(user);
    }

    private void requireSystemAdmin(User user) {
        if (!user.isActive() || user.getRole() != UserRole.SYSTEM_ADMIN) {
            throw new AccessDeniedException(
                    "Chỉ System Admin được thực hiện chức năng này"
            );
        }
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy tài khoản"));
    }

    private User findUserForUpdate(UUID userId) {
        return userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy tài khoản"));
    }

    private PartnerRequest findPartnerRequest(UUID requestId) {
        return partnerRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu đối tác"));
    }

    private PartnerRequest findPartnerRequestForUpdate(UUID requestId) {
        return partnerRequestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu đối tác"));
    }

    private UUID findPartnerRequestUserId(UUID requestId) {
        return partnerRequestRepository.findUserIdById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy yêu cầu đối tác"));
    }

    private void setRoleChangeAuditContext(
            UUID actorId,
            String reason,
            UUID requestId
    ) {
        setLocal("enziu.role_change_actor_id", actorId.toString());
        setLocal("enziu.role_change_reason", reason);
        setLocal("enziu.role_change_source", "PARTNER_APPROVAL");
        setLocal("enziu.role_change_source_request_id", requestId.toString());
    }

    private void setLocal(String key, String value) {
        entityManager.createNativeQuery("select set_config(:key, :value, true)")
                .setParameter("key", key)
                .setParameter("value", value)
                .getSingleResult();
    }

    private PartnerRequest findLatestCurrentRequest(User user) {
        PartnerRequest request = partnerRequestRepository
                .findFirstByUserIdOrderByCreatedAtDescIdDesc(user.getId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Bạn chưa gửi yêu cầu trở thành đối tác"
                ));

        if (user.getRole() == UserRole.CUSTOMER
                && request.getStatus() == PartnerRequestStatus.APPROVED) {
            throw new IllegalArgumentException(
                    "Bạn chưa gửi yêu cầu trở thành đối tác trong chu kỳ hiện tại"
            );
        }
        return request;
    }

    private MultipartFile requireFrame(MultipartFile file, String label) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Thiếu ảnh liveness " + label + ". Vui lòng thực hiện lại eKYC."
            );
        }
        if (file.getSize() > 5L * 1024L * 1024L) {
            throw new IllegalArgumentException(
                    "Ảnh liveness " + label + " vượt quá 5MB"
            );
        }
        return file;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Giá trị không được để trống");
        }
        return value.trim();
    }

    private String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalizeIdentity(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\D", "");
    }

    public record PartnerDocumentResource(
            Resource resource,
            String contentType
    ) {
    }
}
