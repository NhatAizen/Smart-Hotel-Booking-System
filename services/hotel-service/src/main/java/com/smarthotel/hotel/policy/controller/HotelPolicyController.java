package com.smarthotel.hotel.policy.controller;

import com.smarthotel.hotel.policy.dto.HotelPolicyResponse;
import com.smarthotel.hotel.policy.dto.UpdateHotelPolicyRequest;
import com.smarthotel.hotel.policy.service.HotelPolicyService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/hotels")
public class HotelPolicyController {

    private final HotelPolicyService policyService;

    public HotelPolicyController(HotelPolicyService policyService) {
        this.policyService = policyService;
    }

    @GetMapping("/{hotelId}/policies")
    public ResponseEntity<HotelPolicyResponse> getPublic(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(policyService.getPublic(hotelId));
    }

    @GetMapping("/mine/{hotelId}/policies")
    public ResponseEntity<HotelPolicyResponse> getMine(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(policyService.getOwned(currentUserId(jwt), hotelId));
    }

    @PutMapping("/{hotelId}/policies")
    public ResponseEntity<HotelPolicyResponse> update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @Valid @RequestBody UpdateHotelPolicyRequest request
    ) {
        return ResponseEntity.ok(
                policyService.updateOwned(currentUserId(jwt), hotelId, request)
        );
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được tài khoản hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
