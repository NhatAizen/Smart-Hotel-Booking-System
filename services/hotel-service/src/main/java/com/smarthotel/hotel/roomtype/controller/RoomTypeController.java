package com.smarthotel.hotel.roomtype.controller;

import com.smarthotel.hotel.roomtype.dto.CreateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.dto.RoomTypeResponse;
import com.smarthotel.hotel.roomtype.dto.UpdateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.service.RoomTypeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "Room Types", description = "Quản lý loại phòng")
public class RoomTypeController {

    private final RoomTypeService roomTypeService;

    public RoomTypeController(RoomTypeService roomTypeService) {
        this.roomTypeService = roomTypeService;
    }

    @Operation(summary = "Hotel Admin tạo loại phòng")
    @PostMapping("/hotels/{hotelId}/room-types")
    public ResponseEntity<RoomTypeResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @Valid @RequestBody CreateRoomTypeRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(roomTypeService.create(currentUserId(jwt), hotelId, request));
    }

    @Operation(summary = "Public xem loại phòng đang hoạt động")
    @GetMapping("/hotels/{hotelId}/room-types")
    public ResponseEntity<List<RoomTypeResponse>> getPublicByHotel(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(roomTypeService.getPublicByHotel(hotelId));
    }

    @Operation(summary = "Hotel Admin xem toàn bộ loại phòng của khách sạn mình")
    @GetMapping("/hotels/{hotelId}/room-types/manage")
    public ResponseEntity<List<RoomTypeResponse>> getManagedByHotel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(
                roomTypeService.getManagedByHotel(currentUserId(jwt), hotelId)
        );
    }

    @Operation(summary = "Public xem chi tiết loại phòng")
    @GetMapping("/room-types/{roomTypeId}")
    public ResponseEntity<RoomTypeResponse> getPublicById(
            @PathVariable UUID roomTypeId
    ) {
        return ResponseEntity.ok(roomTypeService.getPublicById(roomTypeId));
    }

    @Operation(summary = "Hotel Admin xem chi tiết loại phòng của mình")
    @GetMapping("/room-types/{roomTypeId}/manage")
    public ResponseEntity<RoomTypeResponse> getManagedById(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId
    ) {
        return ResponseEntity.ok(
                roomTypeService.getManagedById(currentUserId(jwt), roomTypeId)
        );
    }

    @Operation(summary = "Hotel Admin cập nhật loại phòng")
    @PutMapping("/room-types/{roomTypeId}")
    public ResponseEntity<RoomTypeResponse> update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId,
            @Valid @RequestBody UpdateRoomTypeRequest request
    ) {
        return ResponseEntity.ok(
                roomTypeService.update(currentUserId(jwt), roomTypeId, request)
        );
    }


    @Operation(summary = "Hotel Admin gửi loại phòng để System Admin xét duyệt")
    @PatchMapping("/room-types/{roomTypeId}/submit")
    public ResponseEntity<RoomTypeResponse> submit(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId
    ) {
        return ResponseEntity.ok(roomTypeService.submit(currentUserId(jwt), roomTypeId));
    }

    @Operation(summary = "Hotel Admin ngừng hoạt động loại phòng")
    @DeleteMapping("/room-types/{roomTypeId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomTypeId
    ) {
        roomTypeService.delete(currentUserId(jwt), roomTypeId);
        return ResponseEntity.noContent().build();
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
