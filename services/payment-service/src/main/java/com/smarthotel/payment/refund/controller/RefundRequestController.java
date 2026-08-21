package com.smarthotel.payment.refund.controller;

import com.smarthotel.payment.refund.dto.CreateRefundRequest;
import com.smarthotel.payment.refund.dto.ManualRefundResolutionRequest;
import com.smarthotel.payment.refund.dto.RefundProofMedia;
import com.smarthotel.payment.refund.dto.RefundRequestResponse;
import com.smarthotel.payment.refund.dto.ReviewRefundRequest;
import com.smarthotel.payment.refund.entity.RefundRequestStatus;
import com.smarthotel.payment.refund.service.RefundRequestService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class RefundRequestController {
    private final RefundRequestService refundRequestService;

    public RefundRequestController(RefundRequestService refundRequestService) {
        this.refundRequestService = refundRequestService;
    }

    @PostMapping("/refunds/requests")
    public ResponseEntity<RefundRequestResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateRefundRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(refundRequestService.create(currentUserId(jwt), request));
    }

    @GetMapping("/refunds/requests/me")
    public List<RefundRequestResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return refundRequestService.customerRequests(currentUserId(jwt));
    }

    @GetMapping("/refunds/requests/booking/{bookingId}")
    public RefundRequestResponse byBooking(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return refundRequestService.byBooking(currentUserId(jwt), bookingId);
    }

    @GetMapping("/refunds/hotel")
    public List<RefundRequestResponse> hotel(@AuthenticationPrincipal Jwt jwt) {
        return refundRequestService.hotelRequests(currentUserId(jwt));
    }

    @PostMapping("/refunds/{id}/approve")
    public RefundRequestResponse approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) ReviewRefundRequest request
    ) {
        return refundRequestService.approve(
                currentUserId(jwt), id, request == null ? null : request.note()
        );
    }

    @PostMapping("/refunds/{id}/reject")
    public RefundRequestResponse reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) ReviewRefundRequest request
    ) {
        return refundRequestService.reject(
                currentUserId(jwt), id, request == null ? "Không đáp ứng chính sách hoàn tiền" : request.note()
        );
    }

    @PostMapping(value = "/refunds/{id}/hotel-proof", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public RefundRequestResponse hotelProof(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestParam String transferReference,
            @RequestPart("transferProof") MultipartFile transferProof
    ) {
        return refundRequestService.recordHotelRefund(
                currentUserId(jwt), id, transferReference, transferProof
        );
    }

    @GetMapping("/refunds/{id}/hotel-proof")
    public ResponseEntity<byte[]> getHotelProof(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id
    ) {
        RefundProofMedia media = refundRequestService.hotelProof(
                currentUserId(jwt), isSystemAdmin(jwt), id
        );
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(
                    media.contentType() == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : media.contentType()
            );
        } catch (IllegalArgumentException exception) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setCacheControl(CacheControl.noStore());
        headers.setContentDisposition(ContentDisposition.inline()
                .filename(media.fileName() == null ? "refund-proof" : media.fileName(), StandardCharsets.UTF_8)
                .build());
        return new ResponseEntity<>(media.data(), headers, HttpStatus.OK);
    }

    @GetMapping("/admin/refunds")
    public List<RefundRequestResponse> admin(
            @RequestParam(required = false) RefundRequestStatus status
    ) {
        return refundRequestService.adminRequests(status);
    }

    @PostMapping("/admin/refunds/{id}/execute-platform")
    public RefundRequestResponse executePlatform(@PathVariable UUID id) {
        return refundRequestService.executePlatformRefund(id);
    }

    @PostMapping("/admin/refunds/{id}/mark-manual-resolved")
    public RefundRequestResponse manualResolved(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody ManualRefundResolutionRequest request
    ) {
        return refundRequestService.markManualResolved(currentUserId(jwt), id, request.note());
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private boolean isSystemAdmin(Jwt jwt) {
        Object role = jwt == null ? null : jwt.getClaim("role");
        return role != null && role.toString().toUpperCase().contains("SYSTEM_ADMIN");
    }
}
