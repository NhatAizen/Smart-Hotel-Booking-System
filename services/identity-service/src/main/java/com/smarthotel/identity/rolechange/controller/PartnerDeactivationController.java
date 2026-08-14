package com.smarthotel.identity.rolechange.controller;

import com.smarthotel.identity.rolechange.dto.PartnerDeactivationResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeEligibilityResponse;
import com.smarthotel.identity.rolechange.dto.RoleChangeReasonRequest;
import com.smarthotel.identity.rolechange.service.RoleChangeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/partner-requests/deactivation")
@PreAuthorize("hasRole('HOTEL_ADMIN')")
public class PartnerDeactivationController {

    private final RoleChangeService roleChangeService;

    public PartnerDeactivationController(RoleChangeService roleChangeService) {
        this.roleChangeService = roleChangeService;
    }

    @GetMapping("/eligibility")
    public RoleChangeEligibilityResponse getEligibility(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return roleChangeService.getSelfDemotionEligibility(
                currentUserId(jwt),
                tokenValue(jwt)
        );
    }

    @GetMapping("/me")
    public PartnerDeactivationResponse getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return roleChangeService.getMyLatestDeactivation(currentUserId(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PartnerDeactivationResponse submit(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody RoleChangeReasonRequest request
    ) {
        return roleChangeService.submitDeactivation(
                currentUserId(jwt),
                request.reason(),
                tokenValue(jwt)
        );
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException("Cannot resolve the current Hotel Admin");
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
