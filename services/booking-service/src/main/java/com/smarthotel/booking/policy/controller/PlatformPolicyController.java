package com.smarthotel.booking.policy.controller;

import com.smarthotel.booking.policy.dto.PlatformPolicyResponse;
import com.smarthotel.booking.policy.dto.UpdatePlatformPolicyRequest;
import com.smarthotel.booking.policy.service.PlatformPolicyService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api")
public class PlatformPolicyController {

    private final PlatformPolicyService policyService;

    public PlatformPolicyController(PlatformPolicyService policyService) {
        this.policyService = policyService;
    }

    @GetMapping("/platform-policies")
    public ResponseEntity<PlatformPolicyResponse> get() {
        return ResponseEntity.ok(policyService.get());
    }

    @PutMapping("/admin/platform-policies")
    public ResponseEntity<PlatformPolicyResponse> update(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdatePlatformPolicyRequest request
    ) {
        return ResponseEntity.ok(
                policyService.update(UUID.fromString(jwt.getSubject()), request)
        );
    }
}
