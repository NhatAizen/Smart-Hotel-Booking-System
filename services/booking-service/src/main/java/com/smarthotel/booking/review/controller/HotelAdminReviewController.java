package com.smarthotel.booking.review.controller;

import com.smarthotel.booking.review.dto.ReviewReplyRequest;
import com.smarthotel.booking.review.dto.ReviewResponse;
import com.smarthotel.booking.review.service.HotelReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/hotel-admin/reviews")
@Tag(name = "Hotel Admin Reviews", description = "Hotel Admin xem và phản hồi đánh giá thuộc khách sạn của mình")
public class HotelAdminReviewController {

    private final HotelReviewService reviewService;

    public HotelAdminReviewController(HotelReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @Operation(summary = "Danh sách đánh giá của các khách sạn do Hotel Admin quản lý")
    @GetMapping
    public ResponseEntity<List<ReviewResponse>> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(
                reviewService.getHotelAdminReviews(
                        currentUserId(jwt),
                        currentToken(jwt)
                )
        );
    }

    @Operation(summary = "Phản hồi một đánh giá")
    @PostMapping("/{reviewId}/reply")
    public ResponseEntity<ReviewResponse> createReply(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID reviewId,
            @Valid @RequestBody ReviewReplyRequest request
    ) {
        return ResponseEntity.ok(
                reviewService.createHotelReply(
                        currentUserId(jwt),
                        currentToken(jwt),
                        reviewId,
                        request.content()
                )
        );
    }

    @Operation(summary = "Cập nhật phản hồi của khách sạn")
    @PutMapping("/{reviewId}/reply")
    public ResponseEntity<ReviewResponse> updateReply(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID reviewId,
            @Valid @RequestBody ReviewReplyRequest request
    ) {
        return ResponseEntity.ok(
                reviewService.updateHotelReply(
                        currentUserId(jwt),
                        currentToken(jwt),
                        reviewId,
                        request.content()
                )
        );
    }

    @Operation(summary = "Xóa phản hồi của khách sạn")
    @DeleteMapping("/{reviewId}/reply")
    public ResponseEntity<ReviewResponse> deleteReply(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID reviewId
    ) {
        return ResponseEntity.ok(
                reviewService.deleteHotelReply(
                        currentUserId(jwt),
                        currentToken(jwt),
                        reviewId
                )
        );
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được Hotel Admin hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private String currentToken(Jwt jwt) {
        if (jwt == null || jwt.getTokenValue() == null || jwt.getTokenValue().isBlank()) {
            throw new IllegalStateException("Không xác định được token Hotel Admin hiện tại");
        }
        return jwt.getTokenValue();
    }
}
