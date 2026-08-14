package com.smarthotel.hotel.roomtype.controller;

import com.smarthotel.hotel.roomtype.dto.RejectRoomTypeRequest;
import com.smarthotel.hotel.roomtype.dto.RoomTypeResponse;
import com.smarthotel.hotel.roomtype.service.RoomTypeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/room-types")
public class RoomTypeAdminController {
    private final RoomTypeService roomTypeService;

    public RoomTypeAdminController(RoomTypeService roomTypeService) {
        this.roomTypeService = roomTypeService;
    }

    @GetMapping("/pending")
    public ResponseEntity<List<RoomTypeResponse>> pending() {
        return ResponseEntity.ok(roomTypeService.getPendingForAdmin());
    }

    @PatchMapping("/{roomTypeId}/approve")
    public ResponseEntity<RoomTypeResponse> approve(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId
    ) {
        return ResponseEntity.ok(roomTypeService.approve(roomTypeId, currentUserId(jwt)));
    }

    @PatchMapping("/{roomTypeId}/reject")
    public ResponseEntity<RoomTypeResponse> reject(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId,
            @Valid @RequestBody RejectRoomTypeRequest request
    ) {
        return ResponseEntity.ok(roomTypeService.reject(roomTypeId, currentUserId(jwt), request.reason()));
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
