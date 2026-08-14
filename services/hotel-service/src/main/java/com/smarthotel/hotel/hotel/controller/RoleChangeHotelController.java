package com.smarthotel.hotel.hotel.controller;

import com.smarthotel.hotel.hotel.dto.DeactivateOwnerHotelsResponse;
import com.smarthotel.hotel.hotel.dto.OwnerHotelPortfolioResponse;
import com.smarthotel.hotel.hotel.service.HotelService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api/role-change/owners/{ownerId}")
public class RoleChangeHotelController {

    private final HotelService hotelService;

    public RoleChangeHotelController(HotelService hotelService) {
        this.hotelService = hotelService;
    }

    @GetMapping("/hotels")
    public ResponseEntity<OwnerHotelPortfolioResponse> getOwnerHotels(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID ownerId
    ) {
        ensureCanInspectOwner(jwt, ownerId);
        return ResponseEntity.ok(hotelService.getOwnerPortfolio(ownerId));
    }

    @PostMapping("/deactivate-hotels")
    public ResponseEntity<DeactivateOwnerHotelsResponse> deactivateOwnerHotels(
            @PathVariable UUID ownerId
    ) {
        return ResponseEntity.ok(hotelService.deactivateOwnerHotels(ownerId));
    }

    private void ensureCanInspectOwner(Jwt jwt, UUID ownerId) {
        String role = currentRole(jwt);
        if ("SYSTEM_ADMIN".equals(role)) {
            return;
        }
        if ("HOTEL_ADMIN".equals(role) && currentUserId(jwt).equals(ownerId)) {
            return;
        }
        throw new AccessDeniedException(
                "Bạn không có quyền kiểm tra khách sạn của tài khoản này"
        );
    }

    private String currentRole(Jwt jwt) {
        Object role = jwt == null ? null : jwt.getClaim("role");
        return role == null ? "" : role.toString().toUpperCase(Locale.ROOT);
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AccessDeniedException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
