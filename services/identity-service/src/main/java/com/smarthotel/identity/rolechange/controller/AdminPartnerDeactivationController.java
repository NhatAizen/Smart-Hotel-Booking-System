package com.smarthotel.identity.rolechange.controller;

import com.smarthotel.identity.rolechange.dto.PartnerDeactivationResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeReasonRequest;
import com.smarthotel.identity.rolechange.entity.PartnerDeactivationStatus;
import com.smarthotel.identity.rolechange.service.RoleChangeService;
import jakarta.validation.Valid;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/admin/partner-requests/deactivations")
@PreAuthorize("hasRole('SYSTEM_ADMIN')")
public class AdminPartnerDeactivationController {

    private final RoleChangeService roleChangeService;

    public AdminPartnerDeactivationController(RoleChangeService roleChangeService) {
        this.roleChangeService = roleChangeService;
    }

    @GetMapping
    public List<PartnerDeactivationResponse> getDeactivations(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) PartnerDeactivationStatus status
    ) {
        return roleChangeService.getDeactivations(currentUserId(jwt), status);
    }

    @PatchMapping("/{requestId}/approve")
    public PartnerDeactivationResponse approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @Valid @RequestBody RoleChangeReasonRequest request
    ) {
        return roleChangeService.approveDeactivation(
                currentUserId(jwt),
                requestId,
                request.reason(),
                tokenValue(jwt)
        );
    }

    @PatchMapping("/{requestId}/reject")
    public PartnerDeactivationResponse reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @Valid @RequestBody RoleChangeReasonRequest request
    ) {
        return roleChangeService.rejectDeactivation(
                currentUserId(jwt),
                requestId,
                request.reason()
        );
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException("Cannot resolve the current System Admin");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException exception) {
            throw new AccessDeniedException("Invalid authenticated user identifier", exception);
        }
    }

    private String tokenValue(Jwt jwt) {
        if (jwt == null || jwt.getTokenValue() == null || jwt.getTokenValue().isBlank()) {
            throw new AccessDeniedException("Missing authenticated access token");
        }
        return jwt.getTokenValue();
    }
}
