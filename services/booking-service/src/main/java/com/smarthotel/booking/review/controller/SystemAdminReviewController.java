package com.smarthotel.booking.review.controller;

import com.smarthotel.booking.review.dto.HideReviewRequest;
import com.smarthotel.booking.review.dto.ReviewResponse;
import com.smarthotel.booking.review.service.HotelReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/reviews")
@Tag(name = "System Admin Reviews", description = "System Admin kiểm duyệt đánh giá toàn hệ thống")
public class SystemAdminReviewController {

    private final HotelReviewService reviewService;

    public SystemAdminReviewController(HotelReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @Operation(summary = "Xem toàn bộ đánh giá gồm cả đánh giá đã ẩn")
    @GetMapping
    public ResponseEntity<List<ReviewResponse>> getAll() {
        return ResponseEntity.ok(reviewService.getAllForSystemAdmin());
    }

    @Operation(summary = "Ẩn đánh giá khỏi public và khỏi điểm trung bình")
    @PatchMapping("/{reviewId}/hide")
    public ResponseEntity<ReviewResponse> hide(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID reviewId,
            @Valid @RequestBody HideReviewRequest request
    ) {
        return ResponseEntity.ok(
                reviewService.hideReview(
                        currentUserId(jwt),
                        reviewId,
                        request.reason()
                )
        );
    }

    @Operation(summary = "Khôi phục đánh giá đã bị ẩn")
    @PatchMapping("/{reviewId}/restore")
    public ResponseEntity<ReviewResponse> restore(
            @PathVariable UUID reviewId
    ) {
        return ResponseEntity.ok(reviewService.restoreReview(reviewId));
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được System Admin hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
