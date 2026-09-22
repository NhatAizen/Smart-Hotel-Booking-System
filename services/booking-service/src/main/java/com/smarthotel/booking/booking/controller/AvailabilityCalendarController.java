package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.AvailabilityCalendarResponse;
import com.smarthotel.booking.booking.service.AvailabilityCalendarService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/hotel-admin/hotels")
@Tag(name = "Hotel availability calendar", description = "Lịch phòng dành cho Hotel Admin")
public class AvailabilityCalendarController {

    private final AvailabilityCalendarService availabilityCalendarService;

    public AvailabilityCalendarController(AvailabilityCalendarService availabilityCalendarService) {
        this.availabilityCalendarService = availabilityCalendarService;
    }

    @Operation(summary = "Hotel Admin xem lịch phòng, booking và room hold theo ngày")
    @GetMapping("/{hotelId}/availability-calendar")
    public ResponseEntity<AvailabilityCalendarResponse> getCalendar(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @RequestParam LocalDate from,
            @RequestParam LocalDate to
    ) {
        return ResponseEntity.ok(availabilityCalendarService.getCalendar(
                currentUserId(jwt),
                hotelId,
                from,
                to,
                jwt.getTokenValue()
        ));
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được Hotel Admin hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
