package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.ApplyPaymentRequest;
import com.smarthotel.booking.booking.dto.AvailabilityResponse;
import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.dto.BookingHoldResponse;
import com.smarthotel.booking.booking.dto.CreateRoomHoldRequest;
import com.smarthotel.booking.booking.dto.CheckInDetailsResponse;
import com.smarthotel.booking.booking.dto.CheckInIdentityQrRequest;
import com.smarthotel.booking.booking.dto.CheckInVerifyRequest;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.qr.BookingQrCodeService;
import com.smarthotel.booking.booking.service.BookingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "Bookings", description = "Quản lý đặt phòng")
public class BookingController {

    private final BookingService bookingService;
    private final BookingQrCodeService qrCodeService;

    public BookingController(
            BookingService bookingService,
            BookingQrCodeService qrCodeService
    ) {
        this.bookingService = bookingService;
        this.qrCodeService = qrCodeService;
    }

    @Operation(summary = "Tạo một booking")
    @PostMapping("/bookings")
    public ResponseEntity<BookingResponse> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateBookingRequest request
    ) {
        UUID userId = currentUserId(jwt);
        if (!userId.equals(request.customerId())) {
            throw new IllegalStateException("Bạn không thể tạo booking cho tài khoản khác");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(bookingService.create(request));
    }

    @Operation(summary = "Tạo nhiều booking trong một lần đặt phòng")
    @PostMapping("/bookings/batch")
    public ResponseEntity<List<BookingResponse>> createBatch(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateBookingBatchRequest request
    ) {
        UUID userId = currentUserId(jwt);
        if (!userId.equals(request.customerId())) {
            throw new IllegalStateException("Bạn không thể tạo booking cho tài khoản khác");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(bookingService.createBatch(request));
    }

    @Operation(summary = "Chi tiết booking")
    @GetMapping("/bookings/{bookingId}")
    public ResponseEntity<BookingResponse> getById(@PathVariable UUID bookingId) {
        return ResponseEntity.ok(bookingService.getById(bookingId));
    }

    @Operation(summary = "QR check-in của booking")
    @GetMapping(
            value = "/bookings/{bookingId}/qr",
            produces = MediaType.IMAGE_PNG_VALUE
    )
    public ResponseEntity<byte[]> getCheckInQr(@PathVariable UUID bookingId) {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(qrCodeService.generatePng(
                        bookingService.getCheckInQrPayload(bookingId)
                ));
    }

    @Operation(summary = "Hotel Admin quét và xác minh QR check-in")
    @PostMapping("/bookings/check-in/verify")
    public ResponseEntity<CheckInDetailsResponse> verifyCheckIn(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CheckInVerifyRequest request
    ) {
        return ResponseEntity.ok(
                bookingService.verifyCheckIn(currentUserId(jwt), request.code())
        );
    }

    @Operation(summary = "Hotel Admin quét QR CCCD và xác minh người đại diện nhận phòng")
    @PostMapping("/bookings/{bookingId}/check-in/verify-identity")
    public ResponseEntity<CheckInDetailsResponse> verifyCheckInIdentity(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId,
            @Valid @RequestBody CheckInIdentityQrRequest request
    ) {
        return ResponseEntity.ok(
                bookingService.verifyCheckInIdentity(
                        currentUserId(jwt),
                        bookingId,
                        request.code(),
                        request.identityQrData()
                )
        );
    }

    @Operation(summary = "Hotel Admin xác nhận đã đối chiếu CCCD/Hộ chiếu trực tiếp tại quầy")
    @PostMapping("/bookings/{bookingId}/check-in/verify-identity-manual")
    public ResponseEntity<CheckInDetailsResponse> verifyCheckInIdentityManual(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId,
            @Valid @RequestBody CheckInVerifyRequest request
    ) {
        return ResponseEntity.ok(
                bookingService.verifyCheckInIdentityManual(
                        currentUserId(jwt),
                        bookingId,
                        request.code()
                )
        );
    }

    @Operation(summary = "Hotel Admin ghi nhận đã thu phần tiền còn lại tại quầy")
    @PostMapping("/bookings/{bookingId}/check-in/collect-at-hotel")
    public ResponseEntity<CheckInDetailsResponse> collectAtHotel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId,
            @Valid @RequestBody CheckInVerifyRequest request
    ) {
        return ResponseEntity.ok(
                bookingService.collectAtHotel(
                        currentUserId(jwt), bookingId, request.code()
                )
        );
    }

    @Operation(summary = "Hotel Admin xác nhận khách nhận phòng bằng QR")
    @PostMapping("/bookings/{bookingId}/check-in/complete")
    public ResponseEntity<CheckInDetailsResponse> completeCheckIn(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId,
            @Valid @RequestBody CheckInVerifyRequest request
    ) {
        return ResponseEntity.ok(
                bookingService.completeCheckIn(
                        currentUserId(jwt), bookingId, request.code(), jwt.getTokenValue()
                )
        );
    }

    @Operation(summary = "Danh sách booking của Customer hiện tại")
    @GetMapping("/bookings/me")
    public ResponseEntity<List<BookingResponse>> getMine(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(bookingService.getByCustomer(currentUserId(jwt)));
    }

    @Operation(summary = "Danh sách booking của khách hàng")
    @GetMapping("/customers/{customerId}/bookings")
    public ResponseEntity<List<BookingResponse>> getByCustomer(
            @PathVariable UUID customerId
    ) {
        return ResponseEntity.ok(bookingService.getByCustomer(customerId));
    }

    @Operation(summary = "Khách hàng ẩn booking đã hủy hoặc đã hoàn tất")
    @PatchMapping("/customers/{customerId}/bookings/{bookingId}/hide")
    public ResponseEntity<Void> hideFromCustomer(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID customerId,
            @PathVariable UUID bookingId
    ) {
        UUID currentUserId = currentUserId(jwt);
        if (!currentUserId.equals(customerId)) {
            throw new IllegalStateException("Bạn không có quyền ẩn booking của người khác");
        }
        bookingService.hideFromCustomer(customerId, bookingId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Khách hàng ẩn booking khỏi danh sách cá nhân")
    @PatchMapping("/bookings/{bookingId}/hide")
    public ResponseEntity<Void> hideCurrentCustomerBooking(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        bookingService.hideFromCustomer(currentUserId(jwt), bookingId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Danh sách booking của khách sạn")
    @GetMapping("/hotels/{hotelId}/bookings")
    public ResponseEntity<List<BookingResponse>> getByHotel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(bookingService.getByHotel(
                hotelId,
                currentUserId(jwt),
                currentRole(jwt)
        ));
    }

    @Operation(summary = "Lọc booking theo trạng thái")
    @GetMapping("/bookings")
    public ResponseEntity<List<BookingResponse>> getByStatus(
            @RequestParam BookingStatus status
    ) {
        return ResponseEntity.ok(bookingService.getByStatus(status));
    }

    @Operation(summary = "Giữ tạm phòng trong 10 phút trước khi hoàn tất booking")
    @PostMapping("/availability/holds")
    public ResponseEntity<BookingHoldResponse> createRoomHold(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateRoomHoldRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(bookingService.createRoomHold(currentUserId(jwt), request));
    }

    @Operation(summary = "Lấy danh sách phòng đã bị giữ/đặt trong khoảng ngày")
    @GetMapping("/availability/hotels/{hotelId}")
    public ResponseEntity<AvailabilityResponse> getAvailability(
            @PathVariable UUID hotelId,
            @RequestParam LocalDate checkIn,
            @RequestParam LocalDate checkOut,
            @RequestParam(required = false) UUID holdToken
    ) {
        return ResponseEntity.ok(
                bookingService.getAvailability(hotelId, checkIn, checkOut, holdToken)
        );
    }

    @Operation(summary = "Payment Service ghi nhận thanh toán thành công")
    @PatchMapping("/bookings/{bookingId}/payment")
    public ResponseEntity<BookingResponse> applyPayment(
            @PathVariable UUID bookingId,
            @Valid @RequestBody ApplyPaymentRequest request
    ) {
        return ResponseEntity.ok(bookingService.applyPayment(bookingId, request));
    }

    @Operation(summary = "Payment Service ghi nhận thanh toán thất bại")
    @PatchMapping("/bookings/{bookingId}/payment-failed")
    public ResponseEntity<BookingResponse> markPaymentFailed(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(bookingService.markPaymentFailed(bookingId));
    }

    @Operation(summary = "Payment Service ghi nhận hoàn tiền")
    @PatchMapping("/bookings/{bookingId}/refunded")
    public ResponseEntity<BookingResponse> markRefunded(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(bookingService.markRefunded(bookingId));
    }

    @Operation(summary = "Xác nhận booking")
    @PatchMapping("/bookings/{bookingId}/confirm")
    public ResponseEntity<BookingResponse> confirm(@PathVariable UUID bookingId) {
        return ResponseEntity.ok(bookingService.confirm(bookingId));
    }

    @Operation(summary = "Nhận phòng thủ công bởi Hotel Admin")
    @PatchMapping("/bookings/{bookingId}/check-in")
    public ResponseEntity<BookingResponse> checkIn(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.checkIn(currentUserId(jwt), bookingId, jwt.getTokenValue())
        );
    }

    @Operation(summary = "Danh sách khách đang lưu trú của Hotel Admin")
    @GetMapping("/bookings/current-stays")
    public ResponseEntity<List<CheckInDetailsResponse>> getCurrentStays(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return ResponseEntity.ok(bookingService.getCurrentStays(currentUserId(jwt)));
    }

    @Operation(summary = "Hotel Admin cập nhật phụ thu trả phòng trễ hiện tại")
    @PostMapping("/bookings/{bookingId}/late-checkout/assess")
    public ResponseEntity<CheckInDetailsResponse> assessLateCheckoutFee(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.assessLateCheckoutFee(currentUserId(jwt), bookingId)
        );
    }

    @Operation(summary = "Hotel Admin xác nhận trả phòng")
    @PatchMapping("/bookings/{bookingId}/check-out")
    public ResponseEntity<CheckInDetailsResponse> checkOut(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(bookingService.checkOut(
                currentUserId(jwt), bookingId, jwt.getTokenValue()
        ));
    }

    @Operation(summary = "Hotel Admin xác nhận khách không đến nhận phòng")
    @PatchMapping("/bookings/{bookingId}/no-show")
    public ResponseEntity<BookingResponse> markNoShow(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(bookingService.markNoShow(currentUserId(jwt), bookingId));
    }

    @Operation(summary = "Hủy booking")
    @PatchMapping("/bookings/{bookingId}/cancel")
    public ResponseEntity<BookingResponse> cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(bookingService.cancel(currentUserId(jwt), bookingId));
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private String currentRole(Jwt jwt) {
        String role = jwt == null ? null : jwt.getClaimAsString("role");
        if (role == null || role.isBlank()) {
            throw new IllegalStateException("Không xác định được vai trò hiện tại");
        }
        return role.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
