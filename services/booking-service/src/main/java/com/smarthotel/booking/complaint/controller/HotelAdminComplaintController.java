package com.smarthotel.booking.complaint.controller;

import com.smarthotel.booking.complaint.dto.ComplaintMessageRequest;
import com.smarthotel.booking.complaint.dto.ComplaintResponse;
import com.smarthotel.booking.complaint.dto.HotelComplaintActionRequest;
import com.smarthotel.booking.complaint.service.ComplaintService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/hotel-admin/complaints")
public class HotelAdminComplaintController {
    private final ComplaintService service;
    public HotelAdminComplaintController(ComplaintService service) { this.service = service; }

    @GetMapping
    public List<ComplaintResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.hotelList(CustomerComplaintController.userId(jwt), CustomerComplaintController.token(jwt));
    }
    @GetMapping("/{id}")
    public ComplaintResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.hotelGet(CustomerComplaintController.userId(jwt), CustomerComplaintController.token(jwt), id);
    }
    @PostMapping(value = "/{id}/responses", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ComplaintResponse respond(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestPart("response") ComplaintMessageRequest request,
            @RequestPart(value = "evidence", required = false) List<MultipartFile> evidence) {
        return service.hotelRespond(CustomerComplaintController.userId(jwt), CustomerComplaintController.token(jwt),
                id, request.message(), evidence);
    }

    @PostMapping(value = "/{id}/actions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ComplaintResponse act(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestPart("action") HotelComplaintActionRequest request,
            @RequestPart(value = "evidence", required = false) List<MultipartFile> evidence) {
        return service.hotelAct(CustomerComplaintController.userId(jwt), CustomerComplaintController.token(jwt),
                id, request, evidence);
    }
}
