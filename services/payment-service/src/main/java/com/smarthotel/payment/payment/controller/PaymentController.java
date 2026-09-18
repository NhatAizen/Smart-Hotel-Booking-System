package com.smarthotel.payment.payment.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.smarthotel.payment.payment.dto.CreatePayOsCheckoutRequest;
import com.smarthotel.payment.payment.dto.PaymentOrderResponse;
import com.smarthotel.payment.payment.dto.PaymentResponse;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(name = "Payments", description = "Thanh toán PayOS, đối soát và hoàn tiền")
public class PaymentController {
    private final PaymentService paymentService;
    public PaymentController(PaymentService paymentService) { this.paymentService = paymentService; }

    @Operation(summary = "Tạo một link PayOS cho nhóm booking")
    @PostMapping("/payments/payos/checkout")
    public ResponseEntity<PaymentOrderResponse> createPayOsCheckout(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePayOsCheckoutRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.createPayOsCheckout(currentUserId(jwt), request));
    }

    @Operation(summary = "Customer thanh toán booking bằng Ví Enziu")
    @PostMapping("/payments/wallet/checkout")
    public ResponseEntity<List<PaymentResponse>> walletCheckout(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePayOsCheckoutRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.createWalletCheckout(currentUserId(jwt), request));
    }

    @Operation(summary = "Hotel Admin ghi nhận thu tiền mặt tại quầy và hạch toán hoa hồng")
    @PostMapping("/payments/cash-at-hotel/{bookingId}")
    public ResponseEntity<PaymentResponse> collectCashAtHotel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.collectCashAtHotel(currentUserId(jwt), bookingId));
    }

    @Operation(summary = "Hotel Admin tạo QR PayOS thu phần còn lại khi check-in")
    @PostMapping("/payments/payos/check-in/{bookingId}")
    public ResponseEntity<PaymentOrderResponse> createCheckInCheckout(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.createCheckInPayOsCheckout(
                        currentUserId(jwt), bookingId
                ));
    }

    @Operation(summary = "Webhook PayOS - public, bắt buộc xác minh signature")
    @PostMapping("/payments/payos/webhook")
    public ResponseEntity<Map<String, String>> webhook(@RequestBody JsonNode payload) {
        paymentService.handlePayOsWebhook(payload);
        return ResponseEntity.ok(Map.of("message", "OK"));
    }

    @Operation(summary = "Đồng bộ trạng thái đơn từ PayOS")
    @PostMapping("/payments/payos/orders/{orderCode}/sync")
    public PaymentOrderResponse sync(@AuthenticationPrincipal Jwt jwt,
                                     @PathVariable long orderCode) {
        return paymentService.sync(currentUserId(jwt), orderCode);
    }

    @Operation(summary = "Chi tiết đơn thanh toán PayOS")
    @GetMapping("/payments/payos/orders/{orderCode}")
    public PaymentOrderResponse order(@AuthenticationPrincipal Jwt jwt,
                                      @PathVariable long orderCode) {
        return paymentService.getOrder(currentUserId(jwt), orderCode);
    }

    @Operation(summary = "Hủy link PayOS chưa thanh toán")
    @PostMapping("/payments/payos/orders/{orderCode}/cancel")
    public PaymentOrderResponse cancel(@AuthenticationPrincipal Jwt jwt,
                                       @PathVariable long orderCode) {
        return paymentService.cancel(currentUserId(jwt), orderCode);
    }

    @GetMapping("/payments/payos/orders/me")
    public List<PaymentOrderResponse> myOrders(@AuthenticationPrincipal Jwt jwt) {
        return paymentService.getCustomerOrders(currentUserId(jwt));
    }

    @GetMapping("/payments/{paymentId}")
    public PaymentResponse payment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId
    ) {
        return paymentService.getById(paymentId, currentUserId(jwt), currentRole(jwt));
    }

    @GetMapping("/bookings/{bookingId}/payments")
    public List<PaymentResponse> bookingPayments(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID bookingId
    ) {
        return paymentService.getByBooking(bookingId, currentUserId(jwt), currentRole(jwt));
    }

    @GetMapping("/customers/{customerId}/payments")
    public List<PaymentResponse> customerPayments(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID customerId
    ) {
        return paymentService.getByCustomer(customerId, currentUserId(jwt), currentRole(jwt));
    }

    @GetMapping("/payments")
    public List<PaymentResponse> byStatus(@RequestParam PaymentStatus status) {
        return paymentService.getByStatus(status);
    }

    @PatchMapping("/payments/{paymentId}/refund")
    public PaymentResponse refund(@PathVariable UUID paymentId) {
        return paymentService.refund(paymentId);
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được người dùng hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private String currentRole(Jwt jwt) {
        String role = jwt == null ? null : jwt.getClaimAsString("role");
        return role == null ? "" : role.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
