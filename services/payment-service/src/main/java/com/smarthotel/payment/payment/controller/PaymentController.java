package com.smarthotel.payment.payment.controller;

import com.smarthotel.payment.payment.dto.CompletePaymentRequest;
import com.smarthotel.payment.payment.dto.CreatePaymentRequest;
import com.smarthotel.payment.payment.dto.FailPaymentRequest;
import com.smarthotel.payment.payment.dto.PaymentResponse;
import com.smarthotel.payment.payment.entity.PaymentStatus;
import com.smarthotel.payment.payment.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@Tag(
        name = "Payments",
        description = "Manage payments and refunds"
)
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(
            PaymentService paymentService
    ) {
        this.paymentService = paymentService;
    }

    @Operation(summary = "Create payment")
    @PostMapping("/payments")
    public ResponseEntity<PaymentResponse> create(
            @Valid @RequestBody CreatePaymentRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(paymentService.create(request));
    }

    @Operation(summary = "Get payment details")
    @GetMapping("/payments/{paymentId}")
    public ResponseEntity<PaymentResponse> getById(
            @PathVariable UUID paymentId
    ) {
        return ResponseEntity.ok(
                paymentService.getById(paymentId)
        );
    }

    @Operation(summary = "List payments by booking")
    @GetMapping("/bookings/{bookingId}/payments")
    public ResponseEntity<List<PaymentResponse>> getByBooking(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                paymentService.getByBooking(bookingId)
        );
    }

    @Operation(summary = "List payments by customer")
    @GetMapping("/customers/{customerId}/payments")
    public ResponseEntity<List<PaymentResponse>> getByCustomer(
            @PathVariable UUID customerId
    ) {
        return ResponseEntity.ok(
                paymentService.getByCustomer(customerId)
        );
    }

    @Operation(summary = "Filter payments by status")
    @GetMapping("/payments")
    public ResponseEntity<List<PaymentResponse>> getByStatus(
            @RequestParam PaymentStatus status
    ) {
        return ResponseEntity.ok(
                paymentService.getByStatus(status)
        );
    }

    @Operation(summary = "Complete payment")
    @PatchMapping("/payments/{paymentId}/complete")
    public ResponseEntity<PaymentResponse> complete(
            @PathVariable UUID paymentId,
            @Valid @RequestBody CompletePaymentRequest request
    ) {
        return ResponseEntity.ok(
                paymentService.complete(paymentId, request)
        );
    }

    @Operation(summary = "Mark payment as failed")
    @PatchMapping("/payments/{paymentId}/fail")
    public ResponseEntity<PaymentResponse> fail(
            @PathVariable UUID paymentId,
            @Valid @RequestBody FailPaymentRequest request
    ) {
        return ResponseEntity.ok(
                paymentService.fail(paymentId, request)
        );
    }

    @Operation(summary = "Refund payment")
    @PatchMapping("/payments/{paymentId}/refund")
    public ResponseEntity<PaymentResponse> refund(
            @PathVariable UUID paymentId
    ) {
        return ResponseEntity.ok(
                paymentService.refund(paymentId)
        );
    }
}