package com.smarthotel.booking.complaint.controller;

import com.smarthotel.booking.complaint.dto.ComplaintResponse;
import com.smarthotel.booking.complaint.dto.CreateComplaintRequest;
import com.smarthotel.booking.complaint.service.ComplaintService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/complaints")
public class CustomerComplaintController {
    private final ComplaintService service;
    public CustomerComplaintController(ComplaintService service) { this.service = service; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ComplaintResponse> create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("complaint") CreateComplaintRequest request,
            @RequestPart(value = "evidence", required = false) List<MultipartFile> evidence) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(userId(jwt), request, evidence));
    }
    @GetMapping
    public List<ComplaintResponse> mine(@AuthenticationPrincipal Jwt jwt) { return service.customerList(userId(jwt)); }
    @GetMapping("/{id}")
    public ComplaintResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.customerGet(userId(jwt), id);
    }
    @PostMapping(value = "/{id}/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ComplaintResponse addEvidence(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(required = false) String note,
            @RequestPart("evidence") List<MultipartFile> evidence) {
        return service.customerAddEvidence(userId(jwt), id, note, evidence);
    }
    @PostMapping("/{id}/cancel")
    public ComplaintResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.customerCancel(userId(jwt), id);
    }
    static UUID userId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null) throw new IllegalStateException("Không xác định được người dùng");
        return UUID.fromString(jwt.getSubject());
    }
    static String token(Jwt jwt) { return jwt == null ? null : jwt.getTokenValue(); }
}
