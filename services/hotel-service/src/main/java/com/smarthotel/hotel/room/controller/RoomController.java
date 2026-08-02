package com.smarthotel.hotel.room.controller;

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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(
        name = "Rooms",
        description = "Quản lý phòng vật lý của khách sạn"
)
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @Operation(summary = "Tạo phòng")
    @PostMapping("/hotels/{hotelId}/rooms")
    public ResponseEntity<RoomResponse> create(
            @PathVariable UUID hotelId,
            @Valid @RequestBody CreateRoomRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(roomService.create(hotelId, request));
    }

    @Operation(summary = "Danh sách phòng theo khách sạn")
    @GetMapping("/hotels/{hotelId}/rooms")
    public ResponseEntity<List<RoomResponse>> getByHotel(
            @PathVariable UUID hotelId,
            @RequestParam(required = false) UUID roomTypeId,
            @RequestParam(required = false) RoomStatus status
    ) {
        return ResponseEntity.ok(
                roomService.getByHotel(
                        hotelId,
                        roomTypeId,
                        status
                )
        );
    }

    @Operation(summary = "Chi tiết phòng")
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> getById(
            @PathVariable UUID roomId
    ) {
        return ResponseEntity.ok(
                roomService.getById(roomId)
        );
    }

    @Operation(summary = "Cập nhật phòng")
    @PutMapping("/rooms/{roomId}")
    public ResponseEntity<RoomResponse> update(
            @PathVariable UUID roomId,
            @Valid @RequestBody UpdateRoomRequest request
    ) {
        return ResponseEntity.ok(
                roomService.update(roomId, request)
        );
    }

    @Operation(summary = "Ngừng hoạt động phòng")
    @DeleteMapping("/rooms/{roomId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID roomId
    ) {
        roomService.delete(roomId);
        return ResponseEntity.noContent().build();
    }
}
