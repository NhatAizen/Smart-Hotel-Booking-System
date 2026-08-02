package com.smarthotel.hotel.hotel.controller;

import com.smarthotel.hotel.hotel.dto.CreateHotelRequest;
import com.smarthotel.hotel.hotel.dto.HotelResponse;
import com.smarthotel.hotel.hotel.dto.UpdateHotelRequest;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import com.smarthotel.hotel.hotel.service.HotelService;
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
@RequestMapping("/api/hotels")
@Tag(
        name = "Hotels",
        description = "Quản lý thông tin khách sạn"
)
public class HotelController {

    private final HotelService hotelService;

    public HotelController(HotelService hotelService) {
        this.hotelService = hotelService;
    }

    @Operation(summary = "Tạo khách sạn")
    @PostMapping
    public ResponseEntity<HotelResponse> create(
            @Valid @RequestBody CreateHotelRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(hotelService.create(request));
    }

    @Operation(summary = "Xem danh sách khách sạn")
    @GetMapping
    public ResponseEntity<List<HotelResponse>> getAll(
            @RequestParam(required = false) String city,
            @RequestParam(required = false) HotelStatus status
    ) {
        return ResponseEntity.ok(
                hotelService.getAll(city, status)
        );
    }

    @Operation(summary = "Xem chi tiết khách sạn")
    @GetMapping("/{hotelId}")
    public ResponseEntity<HotelResponse> getById(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(
                hotelService.getById(hotelId)
        );
    }

    @Operation(summary = "Xem khách sạn theo chủ sở hữu")
    @GetMapping("/owner/{ownerId}")
    public ResponseEntity<List<HotelResponse>> getByOwner(
            @PathVariable UUID ownerId
    ) {
        return ResponseEntity.ok(
                hotelService.getByOwner(ownerId)
        );
    }

    @Operation(summary = "Cập nhật khách sạn")
    @PutMapping("/{hotelId}")
    public ResponseEntity<HotelResponse> update(
            @PathVariable UUID hotelId,
            @Valid @RequestBody UpdateHotelRequest request
    ) {
        return ResponseEntity.ok(
                hotelService.update(hotelId, request)
        );
    }

    @Operation(summary = "Ngừng hoạt động khách sạn")
    @DeleteMapping("/{hotelId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID hotelId
    ) {
        hotelService.delete(hotelId);

        return ResponseEntity.noContent().build();
    }
}