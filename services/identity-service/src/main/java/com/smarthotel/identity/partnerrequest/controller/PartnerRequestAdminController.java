package com.smarthotel.identity.partnerrequest.controller;

import com.smarthotel.identity.partnerrequest.dto.PartnerRequestResponse;
import com.smarthotel.identity.partnerrequest.dto.RejectPartnerRequest;
import com.smarthotel.identity.partnerrequest.entity.PartnerRequestStatus;
import com.smarthotel.identity.partnerrequest.service.PartnerRequestService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/partner-requests")
public class PartnerRequestAdminController {

    private final PartnerRequestService partnerRequestService;

    public PartnerRequestAdminController(PartnerRequestService partnerRequestService) {
        this.partnerRequestService = partnerRequestService;
    }

    @GetMapping
    public ResponseEntity<List<PartnerRequestResponse>> getAll(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) PartnerRequestStatus status
    ) {
        return ResponseEntity.ok(
                partnerRequestService.getByStatus(getCurrentUserId(jwt), status)
        );
    }

    @GetMapping("/{requestId}/cccd/{side}")
    public ResponseEntity<?> getDocument(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @PathVariable String side
    ) {
        PartnerRequestService.PartnerDocumentResource document =
                partnerRequestService.getAdminDocument(
                        getCurrentUserId(jwt),
                        requestId,
                        side
                );

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

    @GetMapping("/{requestId}/ekyc/evidence")
    public ResponseEntity<?> getEkycEvidence(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId
    ) {
        PartnerRequestService.PartnerDocumentResource evidence =
                partnerRequestService.getAdminEkycEvidence(
                        getCurrentUserId(jwt),
                        requestId
                );

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(evidence.contentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .contentType(mediaType)
                .body(evidence.resource());
    }

    @PatchMapping("/{requestId}/approve")
    public ResponseEntity<PartnerRequestResponse> approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId
    ) {
        return ResponseEntity.ok(
                partnerRequestService.approve(getCurrentUserId(jwt), requestId)
        );
    }

    @PatchMapping("/{requestId}/reject")
    public ResponseEntity<PartnerRequestResponse> reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectPartnerRequest request
    ) {
        return ResponseEntity.ok(
                partnerRequestService.reject(
                        getCurrentUserId(jwt),
                        requestId,
                        request.reason()
                )
        );
    }

    private UUID getCurrentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException(
                    "Không xác định được System Admin hiện tại"
            );
        }
        return UUID.fromString(jwt.getSubject());
    }
}
