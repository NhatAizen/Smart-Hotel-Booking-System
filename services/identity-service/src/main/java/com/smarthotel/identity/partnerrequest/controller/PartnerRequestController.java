package com.smarthotel.identity.partnerrequest.controller;

import com.smarthotel.identity.partnerrequest.dto.PartnerOcrPrecheckRequest;
import com.smarthotel.identity.partnerrequest.dto.PartnerOcrPrecheckResponse;
import com.smarthotel.identity.partnerrequest.dto.PartnerRequestResponse;
import com.smarthotel.identity.partnerrequest.dto.SubmitPartnerRequest;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycChallengeResponse;
import com.smarthotel.identity.partnerrequest.ekyc.PartnerEkycPreverifyResponse;
import com.smarthotel.identity.partnerrequest.service.PartnerRequestService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/partner-requests")
public class PartnerRequestController {

    private final PartnerRequestService partnerRequestService;

    public PartnerRequestController(PartnerRequestService partnerRequestService) {
        this.partnerRequestService = partnerRequestService;
    }

    @PostMapping(value = "/ocr/verify", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PartnerOcrPrecheckResponse> verifyOcr(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("data") PartnerOcrPrecheckRequest request,
            @RequestPart("cccdFront") MultipartFile cccdFront,
            @RequestPart("cccdBack") MultipartFile cccdBack
    ) {
        return ResponseEntity.ok(
                partnerRequestService.verifyOcr(
                        getCurrentUserId(jwt),
                        request,
                        cccdFront,
                        cccdBack
                )
        );
    }

    @PostMapping("/ekyc/challenge")
    public ResponseEntity<PartnerEkycChallengeResponse> createEkycChallenge(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(
                partnerRequestService.createEkycChallenge(getCurrentUserId(jwt))
        );
    }

    @PostMapping(value = "/ekyc/verify", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PartnerEkycPreverifyResponse> verifyEkyc(
            @AuthenticationPrincipal Jwt jwt,
            @RequestPart("cccdFront") MultipartFile cccdFront,
            @RequestPart("challengeToken") String challengeToken,
            @RequestPart("livenessFrame0") MultipartFile livenessFrame0,
            @RequestPart("livenessFrame1") MultipartFile livenessFrame1,
            @RequestPart("livenessFrame2") MultipartFile livenessFrame2
    ) {
        return ResponseEntity.ok(
                partnerRequestService.verifyEkyc(
                        getCurrentUserId(jwt),
                        challengeToken,
                        cccdFront,
                        livenessFrame0,
                        livenessFrame1,
                        livenessFrame2
                )
        );
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PartnerRequestResponse> submit(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("data") SubmitPartnerRequest request,
            @RequestPart("cccdFront") MultipartFile cccdFront,
            @RequestPart("cccdBack") MultipartFile cccdBack,
            @RequestPart("ekycReceipt") String ekycReceipt
    ) {
        UUID userId = getCurrentUserId(jwt);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(partnerRequestService.submit(
                        userId,
                        request,
                        cccdFront,
                        cccdBack,
                        ekycReceipt
                ));
    }

    @GetMapping("/me")
    public ResponseEntity<PartnerRequestResponse> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(
                partnerRequestService.getMine(getCurrentUserId(jwt))
        );
    }

    @GetMapping("/me/cccd/front")
    public ResponseEntity<?> getMyCccdFront(@AuthenticationPrincipal Jwt jwt) {
        return documentResponse(
                partnerRequestService.getMyDocument(getCurrentUserId(jwt), "front")
        );
    }

    @GetMapping("/me/cccd/back")
    public ResponseEntity<?> getMyCccdBack(@AuthenticationPrincipal Jwt jwt) {
        return documentResponse(
                partnerRequestService.getMyDocument(getCurrentUserId(jwt), "back")
        );
    }

    private ResponseEntity<?> documentResponse(
            PartnerRequestService.PartnerDocumentResource document
    ) {
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(document.contentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .contentType(mediaType)
                .body(document.resource());
    }

    private UUID getCurrentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException(
                    "Không xác định được người dùng hiện tại"
            );
        }
        return UUID.fromString(jwt.getSubject());
    }
}
