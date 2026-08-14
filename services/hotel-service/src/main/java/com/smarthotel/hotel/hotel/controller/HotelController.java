package com.smarthotel.hotel.hotel.controller;

import com.smarthotel.hotel.hotel.dto.CreateHotelRequest;
import com.smarthotel.hotel.hotel.dto.HotelResponse;
import com.smarthotel.hotel.hotel.dto.UpdateHotelRequest;
import com.smarthotel.hotel.hotel.service.HotelService;
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
@RequestMapping("/api/hotels")
@Tag(name = "Hotels", description = "Đăng ký và quản lý khách sạn")
public class HotelController {

    private final HotelService hotelService;

    public HotelController(HotelService hotelService) {
        this.hotelService = hotelService;
    }

    @Operation(summary = "Hotel Admin tạo hồ sơ khách sạn nháp")
    @PostMapping
    public ResponseEntity<HotelResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateHotelRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(hotelService.create(currentUserId(jwt), request));
    }

    @Operation(summary = "Public xem khách sạn đã duyệt")
    @GetMapping
    public ResponseEntity<List<HotelResponse>> getAll(
            @RequestParam(required = false) String city
    ) {
        return ResponseEntity.ok(hotelService.getPublicHotels(city));
    }

    @Operation(summary = "Hotel Admin xem khách sạn của mình")
    @GetMapping("/mine")
    public ResponseEntity<List<HotelResponse>> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(hotelService.getMine(currentUserId(jwt)));
    }

    @Operation(summary = "Hotel Admin xem chi tiết khách sạn của mình")
    @GetMapping("/mine/{hotelId}")
    public ResponseEntity<HotelResponse> getMineById(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(
                hotelService.getMineById(currentUserId(jwt), hotelId)
        );
    }

    @Operation(summary = "Public xem chi tiết khách sạn đã duyệt")
    @GetMapping("/{hotelId}")
    public ResponseEntity<HotelResponse> getById(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(hotelService.getPublicById(hotelId));
    }

    @Operation(summary = "Hotel Admin cập nhật khách sạn")
    @PutMapping("/{hotelId}")
    public ResponseEntity<HotelResponse> update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId,
            @Valid @RequestBody UpdateHotelRequest request
    ) {
        return ResponseEntity.ok(
                hotelService.updateOwned(currentUserId(jwt), hotelId, request)
        );
    }

    @Operation(summary = "Hotel Admin gửi khách sạn để System Admin xét duyệt")
    @PatchMapping("/{hotelId}/submit")
    public ResponseEntity<HotelResponse> submit(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(
                hotelService.submit(currentUserId(jwt), hotelId)
        );
    }

    @Operation(summary = "Hotel Admin ngừng hoạt động khách sạn")
    @DeleteMapping("/{hotelId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        hotelService.deleteOwned(currentUserId(jwt), hotelId);
        return ResponseEntity.noContent().build();
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
