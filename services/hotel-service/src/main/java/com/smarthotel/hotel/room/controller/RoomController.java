package com.smarthotel.hotel.room.controller;

import com.smarthotel.hotel.room.dto.BatchCreateRoomsRequest;
import com.smarthotel.hotel.room.dto.CreateRoomRequest;
import com.smarthotel.hotel.room.dto.RoomResponse;
import com.smarthotel.hotel.room.dto.UpdateRoomRequest;
import com.smarthotel.hotel.room.entity.RoomStatus;
import com.smarthotel.hotel.room.service.RoomService;
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
@Tag(name = "Rooms", description = "Quản lý phòng vật lý")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @Operation(summary = "Hotel Admin thêm một phòng")
    @PostMapping("/hotels/{hotelId}/rooms")
    public ResponseEntity<RoomResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @Valid @RequestBody CreateRoomRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(roomService.create(currentUserId(jwt), hotelId, request));
    }

    @Operation(summary = "Hotel Admin thêm nhiều phòng")
    @PostMapping("/hotels/{hotelId}/rooms/batch")
    public ResponseEntity<List<RoomResponse>> createBatch(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @Valid @RequestBody BatchCreateRoomsRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(roomService.createBatch(currentUserId(jwt), hotelId, request));
    }

    @Operation(summary = "Public xem phòng đang hoạt động theo trạng thái")
    @GetMapping("/hotels/{hotelId}/rooms")
    public ResponseEntity<List<RoomResponse>> getAvailableByHotel(
            @PathVariable UUID hotelId,
            @RequestParam(required = false) UUID roomTypeId,
            @RequestParam(required = false) RoomStatus status
    ) {
        return ResponseEntity.ok(
                roomService.getAvailableByHotel(hotelId, roomTypeId, status)
        );
    }

    @Operation(summary = "Hotel Admin xem toàn bộ phòng của khách sạn mình")
    @GetMapping("/hotels/{hotelId}/rooms/manage")
    public ResponseEntity<List<RoomResponse>> getManagedByHotel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @RequestParam(required = false) UUID roomTypeId,
            @RequestParam(required = false) RoomStatus status
    ) {
        return ResponseEntity.ok(
                roomService.getManagedByHotel(
                        currentUserId(jwt), hotelId, roomTypeId, status
                )
        );
    }

    @Operation(summary = "Public xem chi tiết phòng")
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> getById(@PathVariable UUID roomId) {
        return ResponseEntity.ok(roomService.getPublicById(roomId));
    }

    @Operation(summary = "Hotel Admin cập nhật phòng")
    @PutMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomId,
            @Valid @RequestBody UpdateRoomRequest request
    ) {
        return ResponseEntity.ok(
                roomService.update(currentUserId(jwt), roomId, request)
        );
    }

    @Operation(summary = "Hotel Admin xác nhận phòng đã vệ sinh xong")
    @PatchMapping("/rooms/{roomId}/cleaning/complete")
    public ResponseEntity<RoomResponse> completeCleaning(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomId
    ) {
        return ResponseEntity.ok(
                roomService.completeCleaning(currentUserId(jwt), roomId)
        );
    }

    @Operation(summary = "Hotel Admin ngừng hoạt động phòng")
    @DeleteMapping("/rooms/{roomId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID roomId
    ) {
        roomService.delete(currentUserId(jwt), roomId);
        return ResponseEntity.noContent().build();
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
