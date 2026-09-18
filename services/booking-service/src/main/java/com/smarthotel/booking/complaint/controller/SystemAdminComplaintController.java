package com.smarthotel.booking.complaint.controller;

import com.smarthotel.booking.complaint.dto.AdminComplaintUpdateRequest;
import com.smarthotel.booking.complaint.dto.ComplaintResponse;
import com.smarthotel.booking.complaint.entity.ComplaintStatus;
import com.smarthotel.booking.complaint.service.ComplaintService;
import jakarta.validation.Valid;
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
@RequestMapping("/api/admin/complaints")
public class SystemAdminComplaintController {
    private final ComplaintService service;
    public SystemAdminComplaintController(ComplaintService service) { this.service = service; }

    @GetMapping
    public List<ComplaintResponse> list(@RequestParam(required = false) ComplaintStatus status) {
        return service.adminList(status);
    }
    @GetMapping("/{id}")
    public ComplaintResponse get(@PathVariable UUID id) { return service.adminGet(id); }
    @PatchMapping("/{id}")
    public ComplaintResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                    @Valid @RequestBody AdminComplaintUpdateRequest request) {
        return service.adminUpdate(CustomerComplaintController.userId(jwt),
                CustomerComplaintController.token(jwt), id, request);
    }
}
