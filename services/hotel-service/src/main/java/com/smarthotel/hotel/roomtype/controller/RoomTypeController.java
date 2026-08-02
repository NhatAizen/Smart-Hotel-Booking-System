package com.smarthotel.hotel.roomtype.controller;

import com.smarthotel.hotel.roomtype.dto.CreateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.dto.RoomTypeResponse;
import com.smarthotel.hotel.roomtype.dto.UpdateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.service.RoomTypeService;
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
        name = "Room Types",
        description = "Quản lý loại phòng của khách sạn"
)
public class RoomTypeController {

    private final RoomTypeService roomTypeService;

    public RoomTypeController(RoomTypeService roomTypeService) {
        this.roomTypeService = roomTypeService;
    }

    @Operation(summary = "Tạo loại phòng")
    @PostMapping("/hotels/{hotelId}/room-types")
    public ResponseEntity<RoomTypeResponse> create(
            @PathVariable UUID hotelId,
            @Valid @RequestBody CreateRoomTypeRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(roomTypeService.create(hotelId, request));
    }

    @Operation(summary = "Danh sách loại phòng theo khách sạn")
    @GetMapping("/hotels/{hotelId}/room-types")
    public ResponseEntity<List<RoomTypeResponse>> getByHotel(
            @PathVariable UUID hotelId,
            @RequestParam(required = false) RoomTypeStatus status
    ) {
        return ResponseEntity.ok(
                roomTypeService.getByHotel(hotelId, status)
        );
    }

    @Operation(summary = "Chi tiết loại phòng")
    @GetMapping("/room-types/{roomTypeId}")
    public ResponseEntity<RoomTypeResponse> getById(
            @PathVariable UUID roomTypeId
    ) {
        return ResponseEntity.ok(
                roomTypeService.getById(roomTypeId)
        );
    }

    @Operation(summary = "Cập nhật loại phòng")
    @PutMapping("/room-types/{roomTypeId}")
    public ResponseEntity<RoomTypeResponse> update(
            @PathVariable UUID roomTypeId,
            @Valid @RequestBody UpdateRoomTypeRequest request
    ) {
        return ResponseEntity.ok(
                roomTypeService.update(roomTypeId, request)
        );
    }

    @Operation(summary = "Ngừng hoạt động loại phòng")
    @DeleteMapping("/room-types/{roomTypeId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID roomTypeId
    ) {
        roomTypeService.delete(roomTypeId);
        return ResponseEntity.noContent().build();
    }
}
