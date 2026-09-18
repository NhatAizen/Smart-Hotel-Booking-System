package com.smarthotel.booking.complaint.controller;

import com.smarthotel.booking.complaint.service.ComplaintService;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/complaints/{complaintId}/evidence")
public class ComplaintEvidenceController {
    private final ComplaintService service;
    public ComplaintEvidenceController(ComplaintService service) { this.service = service; }

    @GetMapping("/{evidenceId}/content")
    public ResponseEntity<?> content(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID complaintId,
                                     @PathVariable UUID evidenceId) {
        Object roleClaim = jwt == null ? null : jwt.getClaim("role");
        ComplaintService.EvidenceDownload item = service.evidence(
                CustomerComplaintController.userId(jwt), roleClaim == null ? null : roleClaim.toString(),
                CustomerComplaintController.token(jwt), complaintId, evidenceId);
        MediaType type;
        try { type = MediaType.parseMediaType(item.contentType()); }
        catch (Exception ignored) { type = MediaType.APPLICATION_OCTET_STREAM; }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(type);
        headers.setCacheControl(CacheControl.noStore());
        headers.setContentDisposition(ContentDisposition.inline()
                .filename(item.fileName(), StandardCharsets.UTF_8).build());
        return ResponseEntity.ok().headers(headers).body(item.resource());
    }
}
