package com.smarthotel.booking.booking.roomchange;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "Room change", description = "Yêu cầu đổi phòng sau khi booking đã được xác nhận")
public class RoomChangeController {

    private final RoomChangeService roomChangeService;

    public RoomChangeController(RoomChangeService roomChangeService) {
        this.roomChangeService = roomChangeService;
    }

    @Operation(summary = "Customer gửi yêu cầu đổi phòng")
    @PostMapping("/bookings/{bookingId}/room-change-requests")
    public ResponseEntity<RoomChangeRequestResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId,
            @Valid @RequestBody CreateRoomChangeRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(roomChangeService.create(currentUserId(jwt), bookingId, request));
    }

    @Operation(summary = "Customer xem các yêu cầu đổi phòng của mình")
    @GetMapping("/bookings/room-change-requests/me")
    public List<RoomChangeRequestResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return roomChangeService.getMine(currentUserId(jwt));
    }

    @Operation(summary = "Hotel Admin xem yêu cầu đổi phòng của một khách sạn")
    @GetMapping("/bookings/room-change-requests/hotel")
    public List<RoomChangeRequestResponse> hotelRequests(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam UUID hotelId
    ) {
        return roomChangeService.getHotelRequests(currentUserId(jwt), hotelId);
    }

    @Operation(summary = "Hotel Admin xem giá và khoản cần bù cho đúng phòng Customer đã chọn")
    @GetMapping("/bookings/room-change-requests/{requestId}/quote")
    public RoomChangeQuoteResponse quote(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId
    ) {
        return roomChangeService.quote(currentUserId(jwt), requestId);
    }

    @Operation(summary = "Hotel Admin duyệt yêu cầu đổi phòng")
    @PatchMapping("/bookings/room-change-requests/{requestId}/approve")
    public RoomChangeRequestResponse approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @Valid @RequestBody ApproveRoomChangeRequest request
    ) {
        return roomChangeService.approve(currentUserId(jwt), requestId, request);
    }

    @Operation(summary = "Hotel Admin từ chối yêu cầu đổi phòng")
    @PatchMapping("/bookings/room-change-requests/{requestId}/reject")
    public RoomChangeRequestResponse reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectRoomChangeRequest request
    ) {
        return roomChangeService.reject(currentUserId(jwt), requestId, request);
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
