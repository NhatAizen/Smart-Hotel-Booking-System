package com.smarthotel.booking.favorite.controller;

import com.smarthotel.booking.favorite.dto.FavoriteHotelResponse;
import com.smarthotel.booking.favorite.dto.FavoriteStateResponse;
import com.smarthotel.booking.favorite.service.CustomerHotelFavoriteService;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/favorites")
public class CustomerHotelFavoriteController {

    private final CustomerHotelFavoriteService favoriteService;

    public CustomerHotelFavoriteController(CustomerHotelFavoriteService favoriteService) {
        this.favoriteService = favoriteService;
    }

    @Operation(summary = "Danh sách khách sạn yêu thích của customer hiện tại")
    @GetMapping
    public ResponseEntity<List<FavoriteHotelResponse>> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(favoriteService.getMine(currentUserId(jwt)));
    }

    @Operation(summary = "Kiểm tra một khách sạn có nằm trong danh sách yêu thích")
    @GetMapping("/{hotelId}")
    public ResponseEntity<FavoriteStateResponse> getState(
            @PathVariable UUID hotelId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(
                favoriteService.getState(currentUserId(jwt), hotelId)
        );
    }

    @Operation(summary = "Thêm khách sạn vào yêu thích")
    @PostMapping("/{hotelId}")
    public ResponseEntity<FavoriteHotelResponse> add(
            @PathVariable UUID hotelId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(favoriteService.add(currentUserId(jwt), hotelId));
    }

    @Operation(summary = "Bỏ khách sạn khỏi yêu thích")
    @DeleteMapping("/{hotelId}")
    public ResponseEntity<Map<String, Object>> remove(
            @PathVariable UUID hotelId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        favoriteService.remove(currentUserId(jwt), hotelId);
        return ResponseEntity.ok(
                Map.of(
                        "hotelId", hotelId,
                        "favorite", false
                )
        );
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
