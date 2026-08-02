package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.service.BookingService;
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
        name = "Bookings",
        description = "Quản lý đặt phòng"
)
public class BookingController {

    private final BookingService bookingService;

    public BookingController(
            BookingService bookingService
    ) {
        this.bookingService = bookingService;
    }

    @Operation(summary = "Tạo booking")
    @PostMapping("/bookings")
    public ResponseEntity<BookingResponse> create(
            @Valid @RequestBody CreateBookingRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(bookingService.create(request));
    }

    @Operation(summary = "Chi tiết booking")
    @GetMapping("/bookings/{bookingId}")
    public ResponseEntity<BookingResponse> getById(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.getById(bookingId)
        );
    }

    @Operation(summary = "Danh sách booking của khách hàng")
    @GetMapping("/customers/{customerId}/bookings")
    public ResponseEntity<List<BookingResponse>> getByCustomer(
            @PathVariable UUID customerId
    ) {
        return ResponseEntity.ok(
                bookingService.getByCustomer(customerId)
        );
    }

    @Operation(summary = "Danh sách booking của khách sạn")
    @GetMapping("/hotels/{hotelId}/bookings")
    public ResponseEntity<List<BookingResponse>> getByHotel(
            @PathVariable UUID hotelId
    ) {
        return ResponseEntity.ok(
                bookingService.getByHotel(hotelId)
        );
    }

    @Operation(summary = "Lọc booking theo trạng thái")
    @GetMapping("/bookings")
    public ResponseEntity<List<BookingResponse>> getByStatus(
            @RequestParam BookingStatus status
    ) {
        return ResponseEntity.ok(
                bookingService.getByStatus(status)
        );
    }

    @Operation(summary = "Xác nhận booking")
    @PatchMapping("/bookings/{bookingId}/confirm")
    public ResponseEntity<BookingResponse> confirm(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.confirm(bookingId)
        );
    }

    @Operation(summary = "Nhận phòng")
    @PatchMapping("/bookings/{bookingId}/check-in")
    public ResponseEntity<BookingResponse> checkIn(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.checkIn(bookingId)
        );
    }

    @Operation(summary = "Trả phòng")
    @PatchMapping("/bookings/{bookingId}/check-out")
    public ResponseEntity<BookingResponse> checkOut(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.checkOut(bookingId)
        );
    }

    @Operation(summary = "Hủy booking")
    @PatchMapping("/bookings/{bookingId}/cancel")
    public ResponseEntity<BookingResponse> cancel(
            @PathVariable UUID bookingId
    ) {
        return ResponseEntity.ok(
                bookingService.cancel(bookingId)
        );
    }
}