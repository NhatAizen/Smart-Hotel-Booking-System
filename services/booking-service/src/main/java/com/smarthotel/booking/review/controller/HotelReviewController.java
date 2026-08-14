package com.smarthotel.booking.review.controller;

import com.smarthotel.booking.review.dto.CreateReviewRequest;
import com.smarthotel.booking.review.dto.ReviewResponse;
import com.smarthotel.booking.review.dto.ReviewSummaryResponse;
import com.smarthotel.booking.review.service.HotelReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reviews")
@Tag(name = "Hotel Reviews", description = "Đánh giá khách sạn từ booking đã hoàn thành")
public class HotelReviewController {

    private final HotelReviewService reviewService;

    public HotelReviewController(HotelReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @Operation(summary = "Khách hàng tạo đánh giá kèm ảnh")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReviewResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("review") CreateReviewRequest request,
            @RequestPart(value = "images", required = false) List<MultipartFile> images
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(reviewService.create(currentUserId(jwt), request, images));
    }

    @Operation(summary = "Danh sách đánh giá thật của khách sạn")
    @GetMapping("/hotels/{hotelId}")
    public ResponseEntity<List<ReviewResponse>> getByHotel(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(reviewService.getByHotel(hotelId));
    }

    @Operation(summary = "Tổng hợp điểm đánh giá thật của khách sạn")
    @GetMapping("/hotels/{hotelId}/summary")
    public ResponseEntity<ReviewSummaryResponse> getSummary(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(reviewService.getSummary(hotelId));
    }

    @Operation(summary = "Danh sách đánh giá của khách hàng hiện tại")
    @GetMapping("/me")
    public ResponseEntity<List<ReviewResponse>> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(reviewService.getMyReviews(currentUserId(jwt)));
    }

    @Operation(summary = "Lấy đánh giá theo booking")
    @GetMapping("/bookings/{bookingId}")
    public ResponseEntity<ReviewResponse> getByBooking(
            @PathVariable UUID bookingId
    ) {
        ReviewResponse response = reviewService.getByBooking(bookingId);
        return response == null
                ? ResponseEntity.notFound().build()
                : ResponseEntity.ok(response);
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
