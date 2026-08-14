package com.smarthotel.identity.rolechange.controller;

import com.smarthotel.identity.rolechange.dto.RoleChangeEligibilityResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeReasonRequest;
import com.smarthotel.identity.rolechange.dto.RoleChangeUserResponse;
import com.smarthotel.identity.rolechange.service.RoleChangeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users/{userId}")
@PreAuthorize("hasRole('SYSTEM_ADMIN')")
public class AdminRoleChangeController {

    private final RoleChangeService roleChangeService;

    public AdminRoleChangeController(RoleChangeService roleChangeService) {
        this.roleChangeService = roleChangeService;
    }

    @PatchMapping("/promote-to-hotel-admin")
    public ResponseEntity<RoleChangeUserResponse> promote(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId,
            @Valid @RequestBody RoleChangeReasonRequest request
    ) {
        return ResponseEntity.ok(roleChangeService.promoteToHotelAdmin(
                currentUserId(jwt),
                userId,
                request.reason()
        ));
    }

    @GetMapping("/demotion-eligibility")
    public ResponseEntity<RoleChangeEligibilityResponse> demotionEligibility(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId
    ) {
        return ResponseEntity.ok(roleChangeService.getAdminDemotionEligibility(
                currentUserId(jwt),
                userId,
                tokenValue(jwt)
        ));
    }

    @PatchMapping("/demote-to-customer")
    public ResponseEntity<RoleChangeUserResponse> demote(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID userId,
            @Valid @RequestBody RoleChangeReasonRequest request
    ) {
        return ResponseEntity.ok(roleChangeService.demoteToCustomer(
                currentUserId(jwt),
                userId,
                request.reason(),
                tokenValue(jwt)
        ));
    }

    static UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException("Cannot resolve the current System Admin");
        }
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException exception) {
            throw new AccessDeniedException("Invalid authenticated user identifier", exception);
        }
    }

    static String tokenValue(Jwt jwt) {
        if (jwt == null || jwt.getTokenValue() == null || jwt.getTokenValue().isBlank()) {
            throw new AccessDeniedException("Missing authenticated access token");
        }
        return jwt.getTokenValue();
    }
}
