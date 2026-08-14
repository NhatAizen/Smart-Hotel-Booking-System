package com.smarthotel.hotel.hotel.controller;

import com.smarthotel.hotel.hotel.dto.HotelResponse;
import com.smarthotel.hotel.hotel.dto.RejectHotelRequest;
import com.smarthotel.hotel.hotel.service.HotelService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/hotels")
public class HotelAdminController {

    private final HotelService hotelService;

    public HotelAdminController(
            HotelService hotelService
    ) {
        this.hotelService = hotelService;
    }

    @GetMapping("/pending")
    public ResponseEntity<List<HotelResponse>> getPending() {
        return ResponseEntity.ok(
                hotelService.getPendingHotels()
        );
    }

    @PatchMapping("/{hotelId}/approve")
    public ResponseEntity<HotelResponse> approve(
            @PathVariable UUID hotelId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        UUID systemAdminId =
                UUID.fromString(jwt.getSubject());

        return ResponseEntity.ok(
                hotelService.approve(
                        hotelId,
                        systemAdminId
                )
        );
    }

    @PatchMapping("/{hotelId}/reject")
    public ResponseEntity<HotelResponse> reject(
            @PathVariable UUID hotelId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid
            @RequestBody RejectHotelRequest request
    ) {
        UUID systemAdminId =
                UUID.fromString(jwt.getSubject());

        return ResponseEntity.ok(
                hotelService.reject(
                        hotelId,
                        systemAdminId,
                        request.reason()
                )
        );
    }
}