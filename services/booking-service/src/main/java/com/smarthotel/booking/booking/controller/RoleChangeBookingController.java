package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityResponse;
import com.smarthotel.booking.booking.service.BookingService;
import com.smarthotel.booking.integration.hotel.RoleChangeHotelClient;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/role-change/eligibility")
public class RoleChangeBookingController {

    private final BookingService bookingService;
    private final RoleChangeHotelClient hotelClient;

    public RoleChangeBookingController(
            BookingService bookingService,
            RoleChangeHotelClient hotelClient
    ) {
        this.bookingService = bookingService;
        this.hotelClient = hotelClient;
    }

    @PostMapping("/bookings")
    public ResponseEntity<RoleChangeBookingEligibilityResponse> getBookingEligibility(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody RoleChangeBookingEligibilityRequest request
    ) {
        ensureCanInspectOwner(jwt, request.ownerId());
        ensureOwnedHotelIds(jwt, request);
        return ResponseEntity.ok(bookingService.getRoleChangeEligibility(request));
    }

    private void ensureOwnedHotelIds(
            Jwt jwt,
            RoleChangeBookingEligibilityRequest request
    ) {
        Set<UUID> expected = Set.copyOf(
                hotelClient.getOwnerHotelPortfolio(
                        request.ownerId(),
                        jwt.getTokenValue()
                ).hotelIds()
        );
        Set<UUID> supplied = Set.copyOf(request.hotelIds());
        if (!expected.equals(supplied)) {
            throw new AccessDeniedException(
                    "Danh sach khach san khong thuoc dung chu tai khoan"
            );
        }
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
                "Bạn không có quyền kiểm tra booking của tài khoản này"
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
