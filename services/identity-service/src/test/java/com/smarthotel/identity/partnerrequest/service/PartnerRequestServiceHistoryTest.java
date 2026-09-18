package com.smarthotel.identity.partnerrequest.service;

import com.smarthotel.identity.integration.notification.NotificationClient;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycClient;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycVerificationResult;
import com.smarthotel.identity.partnerrequest.ekyc.session.PartnerEkycVerificationSessionService;
import com.smarthotel.identity.partnerrequest.dto.SubmitPartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerApplicantType;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus;
import com.smarthotel.identity.partnerrequest.media.PartnerDocumentStorageService;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrResult;
import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrService;
import com.smarthotel.identity.partnerrequest.repository.PartnerRequestRepository;
import com.smarthotel.identity.token.service.RefreshTokenService;
import com.smarthotel.identity.user.entity.User;
import com.smarthotel.identity.user.entity.UserRole;
import com.smarthotel.identity.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PartnerRequestServiceHistoryTest {

    @Mock
    private PartnerRequestRepository partnerRequestRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private NotificationClient notificationClient;

    @Mock
    private PartnerOcrService ocrService;

    @Mock
    private PartnerEkycClient ekycClient;

    @Mock
    private PartnerEkycVerificationSessionService ekycSessionService;

    @Mock
    private PartnerDocumentStorageService documentStorageService;

    @Mock
    private EntityManager entityManager;

    @Mock
    private Query auditQuery;

    private PartnerRequestService service;

    @BeforeEach
    void setUp() {
        service = new PartnerRequestService(
                partnerRequestRepository,
                userRepository,
                refreshTokenService,
                notificationClient,
                ocrService,
                ekycClient,
                ekycSessionService,
                documentStorageService,
                entityManager
        );
        org.mockito.Mockito.lenient()
                .when(entityManager.createNativeQuery(any(String.class)))
                .thenReturn(auditQuery);
        org.mockito.Mockito.lenient()
                .when(auditQuery.setParameter(any(String.class), any()))
                .thenReturn(auditQuery);
    }

    @Test
    void approvalLocksApplicantAndRequestBeforeRecheckingAndPromotion() {
        UUID adminId = UUID.randomUUID();
        UUID applicantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        User admin = user(adminId, UserRole.SYSTEM_ADMIN);
        User applicant = user(applicantId, UserRole.CUSTOMER);
        PartnerRequest request = pendingRequest(applicantId);
        ReflectionTestUtils.setField(request, "id", requestId);

        when(userRepository.findByIdForUpdate(adminId)).thenReturn(Optional.of(admin));
        when(partnerRequestRepository.findUserIdById(requestId))
                .thenReturn(Optional.of(applicantId));
        when(userRepository.findByIdForUpdate(applicantId))
                .thenReturn(Optional.of(applicant));
        when(partnerRequestRepository.findByIdForUpdate(requestId))
                .thenReturn(Optional.of(request));

        service.approve(adminId, requestId);

        assertEquals(UserRole.HOTEL_ADMIN, applicant.getRole());
        assertEquals(PartnerRequestStatus.APPROVED, request.getStatus());
        assertEquals(adminId, request.getReviewedBy());
        verify(refreshTokenService).revokeAllForUser(applicantId);

        InOrder lockOrder = inOrder(userRepository, partnerRequestRepository);
        lockOrder.verify(userRepository).findByIdForUpdate(adminId);
        lockOrder.verify(partnerRequestRepository).findUserIdById(requestId);
        lockOrder.verify(userRepository).findByIdForUpdate(applicantId);
        lockOrder.verify(partnerRequestRepository).findByIdForUpdate(requestId);
    }

    @Test
    void customerAfterPriorApprovalSubmitsANewHistoryRow() {
        UUID applicantId = UUID.randomUUID();
        LocalDate dateOfBirth = LocalDate.of(1990, 1, 1);
        String identityNumber = "012345678901";
        User customer = user(applicantId, UserRole.CUSTOMER);
        MultipartFile front = org.mockito.Mockito.mock(MultipartFile.class);
        MultipartFile back = org.mockito.Mockito.mock(MultipartFile.class);
        SubmitPartnerRequest payload = new SubmitPartnerRequest(
                PartnerApplicantType.INDIVIDUAL,
                "Applicant",
                "Applicant",
                identityNumber,
                dateOfBirth,
                "0900000000",
                "Hanoi",
                "applicant@example.com",
                null,
                null
        );

        when(userRepository.findByIdForUpdate(applicantId))
                .thenReturn(Optional.of(customer));
        when(partnerRequestRepository.existsByUserIdAndStatus(
                applicantId,
                PartnerRequestStatus.PENDING
        )).thenReturn(false);
        when(partnerRequestRepository.existsByIdentityNumberAndUserIdNot(
                identityNumber,
                applicantId
        )).thenReturn(false);
        when(ocrService.verify(
                front,
                back,
                identityNumber,
                "Applicant",
                dateOfBirth
        )).thenReturn(verifiedOcr(dateOfBirth));
        when(ekycSessionService.consumeWithEvidence(applicantId, "receipt", front))
                .thenReturn(new PartnerEkycVerificationSessionService.ConsumedVerification(
                        verifiedEkyc(),
                        applicantId + "/ekyc/verified-face-test.jpg"
                ));
        when(documentStorageService.storePair(applicantId, front, back))
                .thenReturn(new PartnerDocumentStorageService.StoredDocuments(
                        "new-front.jpg",
                        "new-back.jpg"
                ));
        when(partnerRequestRepository.saveAndFlush(any(PartnerRequest.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.submit(
                applicantId,
                payload,
                front,
                back,
                "receipt",
                null,
                null
        );

        assertEquals(PartnerRequestStatus.PENDING, response.status());
        ArgumentCaptor<PartnerRequest> requestCaptor =
                ArgumentCaptor.forClass(PartnerRequest.class);
        verify(partnerRequestRepository).saveAndFlush(requestCaptor.capture());
        assertEquals(applicantId, requestCaptor.getValue().getUserId());
        assertEquals(PartnerRequestStatus.PENDING, requestCaptor.getValue().getStatus());
        verify(partnerRequestRepository)
                .findFirstByUserIdOrderByCreatedAtDescIdDesc(applicantId);
    }

    @Test
    void businessApplicationRequiresRegistrationDocument() {
        UUID applicantId = UUID.randomUUID();
        User customer = user(applicantId, UserRole.CUSTOMER);
        SubmitPartnerRequest payload = new SubmitPartnerRequest(
                PartnerApplicantType.BUSINESS,
                "Enziu Demo Company",
                "Applicant",
                "012345678901",
                LocalDate.of(1990, 1, 1),
                "0900000000",
                "Hanoi",
                "business@example.com",
                "0123456789",
                null
        );

        when(userRepository.findByIdForUpdate(applicantId)).thenReturn(Optional.of(customer));
        when(partnerRequestRepository.existsByUserIdAndStatus(
                applicantId,
                PartnerRequestStatus.PENDING
        )).thenReturn(false);
        when(partnerRequestRepository.findFirstByUserIdOrderByCreatedAtDescIdDesc(applicantId))
                .thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> service.submit(
                        applicantId,
                        payload,
                        org.mockito.Mockito.mock(MultipartFile.class),
                        org.mockito.Mockito.mock(MultipartFile.class),
                        "receipt",
                        null,
                        null
                )
        );

        assertTrue(exception.getMessage().contains("giấy chứng nhận đăng ký"));
    }

    @Test
    void businessApplicationWithRegistrationDocumentIsSubmitted() {
        UUID applicantId = UUID.randomUUID();
        LocalDate dateOfBirth = LocalDate.of(1990, 1, 1);
        User customer = user(applicantId, UserRole.CUSTOMER);
        MultipartFile front = org.mockito.Mockito.mock(MultipartFile.class);
        MultipartFile back = org.mockito.Mockito.mock(MultipartFile.class);
        MultipartFile license = org.mockito.Mockito.mock(MultipartFile.class);
        when(license.isEmpty()).thenReturn(false);
        SubmitPartnerRequest payload = new SubmitPartnerRequest(
                PartnerApplicantType.BUSINESS,
                "Enziu Demo Company",
                "Applicant",
                "012345678901",
                dateOfBirth,
                "0900000000",
                "Hanoi",
                "business@example.com",
                "0123456789",
                null
        );

        when(userRepository.findByIdForUpdate(applicantId)).thenReturn(Optional.of(customer));
        when(partnerRequestRepository.existsByUserIdAndStatus(
                applicantId,
                PartnerRequestStatus.PENDING
        )).thenReturn(false);
        when(partnerRequestRepository.findFirstByUserIdOrderByCreatedAtDescIdDesc(applicantId))
                .thenReturn(Optional.empty());
        when(partnerRequestRepository.existsByIdentityNumberAndUserIdNot(
                "012345678901",
                applicantId
        )).thenReturn(false);
        when(ocrService.verify(front, back, "012345678901", "Applicant", dateOfBirth))
                .thenReturn(verifiedOcr(dateOfBirth));
        when(ekycSessionService.consumeWithEvidence(applicantId, "receipt", front))
                .thenReturn(new PartnerEkycVerificationSessionService.ConsumedVerification(
                        verifiedEkyc(),
                        applicantId + "/ekyc/verified-face.jpg"
                ));
        when(documentStorageService.storePair(applicantId, front, back))
                .thenReturn(new PartnerDocumentStorageService.StoredDocuments(
                        "front.jpg",
                        "back.jpg"
                ));
        when(documentStorageService.storeSupportingDocument(
                applicantId,
                "business-license",
                license
        )).thenReturn(new PartnerDocumentStorageService.StoredDocument(
                applicantId + "/supporting/business.pdf",
                "dang-ky-kinh-doanh.pdf",
                "application/pdf",
                1024L
        ));
        when(partnerRequestRepository.saveAndFlush(any(PartnerRequest.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.submit(
                applicantId,
                payload,
                front,
                back,
                "receipt",
                null,
                license
        );

        assertEquals(PartnerRequestStatus.PENDING, response.status());
        assertEquals("0123456789", response.businessTaxCode());
        assertTrue(response.businessLicenseAvailable());
        assertEquals("dang-ky-kinh-doanh.pdf", response.businessLicenseName());
    }

    @Test
    void systemAdminCanRequestMoreInformationWithReason() {
        UUID adminId = UUID.randomUUID();
        UUID applicantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        PartnerRequest request = pendingRequest(applicantId);
        ReflectionTestUtils.setField(request, "id", requestId);

        when(userRepository.findByIdForUpdate(adminId))
                .thenReturn(Optional.of(user(adminId, UserRole.SYSTEM_ADMIN)));
        when(partnerRequestRepository.findUserIdById(requestId))
                .thenReturn(Optional.of(applicantId));
        when(userRepository.findByIdForUpdate(applicantId))
                .thenReturn(Optional.of(user(applicantId, UserRole.CUSTOMER)));
        when(partnerRequestRepository.findByIdForUpdate(requestId))
                .thenReturn(Optional.of(request));

        var response = service.requestMoreInfo(
                adminId,
                requestId,
                "Bổ sung giấy tờ quản lý"
        );

        assertEquals(PartnerRequestStatus.NEED_MORE_INFO, response.status());
        assertEquals("Bổ sung giấy tờ quản lý", response.rejectionReason());
        assertEquals(adminId, response.reviewedBy());
        verify(notificationClient).sendUser(
                applicantId,
                "Hồ sơ đối tác cần bổ sung",
                "EnziuRooms cần bạn bổ sung hồ sơ. Lý do: Bổ sung giấy tờ quản lý",
                "PARTNER_REQUEST",
                "PARTNER",
                "/customer/partner"
        );
    }

    @Test
    void needMoreInfoApplicationIsResubmittedOnSameRecord() {
        UUID applicantId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        LocalDate dateOfBirth = LocalDate.of(1990, 1, 1);
        User customer = user(applicantId, UserRole.CUSTOMER);
        PartnerRequest existing = pendingRequest(applicantId);
        UUID requestId = UUID.randomUUID();
        ReflectionTestUtils.setField(existing, "id", requestId);
        existing.requestMoreInfo(adminId, "Bổ sung tài liệu quản lý");
        MultipartFile front = org.mockito.Mockito.mock(MultipartFile.class);
        MultipartFile back = org.mockito.Mockito.mock(MultipartFile.class);
        SubmitPartnerRequest payload = new SubmitPartnerRequest(
                PartnerApplicantType.INDIVIDUAL,
                "Applicant",
                "Applicant",
                "012345678901",
                dateOfBirth,
                "0900000000",
                "Hanoi",
                "applicant@example.com",
                null,
                null
        );

        when(userRepository.findByIdForUpdate(applicantId)).thenReturn(Optional.of(customer));
        when(partnerRequestRepository.existsByUserIdAndStatus(
                applicantId,
                PartnerRequestStatus.PENDING
        )).thenReturn(false);
        when(partnerRequestRepository.findFirstByUserIdOrderByCreatedAtDescIdDesc(applicantId))
                .thenReturn(Optional.of(existing));
        when(partnerRequestRepository.existsByIdentityNumberAndUserIdNot(
                "012345678901",
                applicantId
        )).thenReturn(false);
        when(ocrService.verify(front, back, "012345678901", "Applicant", dateOfBirth))
                .thenReturn(verifiedOcr(dateOfBirth));
        when(ekycSessionService.consumeWithEvidence(applicantId, "receipt", front))
                .thenReturn(new PartnerEkycVerificationSessionService.ConsumedVerification(
                        verifiedEkyc(),
                        applicantId + "/ekyc/new-evidence.jpg"
                ));
        when(documentStorageService.storePair(applicantId, front, back))
                .thenReturn(new PartnerDocumentStorageService.StoredDocuments(
                        "new-front.jpg",
                        "new-back.jpg"
                ));
        when(partnerRequestRepository.saveAndFlush(existing)).thenReturn(existing);

        var response = service.submit(
                applicantId,
                payload,
                front,
                back,
                "receipt",
                null,
                null
        );

        assertEquals(requestId, response.id());
        assertEquals(PartnerRequestStatus.PENDING, response.status());
        assertNull(response.rejectionReason());
    }

    @Test
    void customerCannotUseSystemAdminDocumentEndpoint() {
        UUID customerId = UUID.randomUUID();
        when(userRepository.findById(customerId))
                .thenReturn(Optional.of(user(customerId, UserRole.CUSTOMER)));

        assertThrows(
                org.springframework.security.access.AccessDeniedException.class,
                () -> service.getAdminSupportingDocument(
                        customerId,
                        UUID.randomUUID(),
                        "business-license"
                )
        );
    }

    private User user(UUID id, UserRole role) {
        User user = new User(
                role.name().toLowerCase() + "-" + id + "@example.com",
                "encoded-password",
                role.name(),
                role
        );
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    private PartnerRequest pendingRequest(UUID userId) {
        LocalDate dateOfBirth = LocalDate.of(1990, 1, 1);
        return new PartnerRequest(
                userId,
                PartnerApplicantType.INDIVIDUAL,
                "Applicant",
                "Applicant",
                "012345678901",
                dateOfBirth,
                "0900000000",
                "Hanoi",
                "applicant@example.com",
                null,
                null,
                null,
                "front.jpg",
                "back.jpg",
                verifiedOcr(dateOfBirth),
                verifiedEkyc(),
                userId + "/ekyc/verified-face-test.jpg",
                null
        );
    }

    private PartnerOcrResult verifiedOcr(LocalDate dateOfBirth) {
        return new PartnerOcrResult(
                "012345678901",
                "Applicant",
                dateOfBirth,
                true,
                true,
                true,
                true,
                "012345678901",
                "Applicant",
                dateOfBirth,
                true,
                true,
                true,
                "Nam",
                "VNM",
                dateOfBirth.plusYears(20),
                true,
                true
        );
    }

    private PartnerEkycVerificationResult verifiedEkyc() {
        return new PartnerEkycVerificationResult(
                true,
                true,
                true,
                new BigDecimal("0.99"),
                new BigDecimal("0.80"),
                UUID.randomUUID().toString(),
                Instant.now(),
                Map.of()
        );
    }
}
