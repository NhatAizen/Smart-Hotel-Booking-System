package com.smarthotel.booking.booking.controller;

import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.repository.BookingRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/bookings/admin")
@Tag(name = "Admin bookings", description = "System Admin theo dõi booking toàn hệ thống")
public class AdminBookingController {

    private final BookingRepository bookingRepository;

    public AdminBookingController(BookingRepository bookingRepository) {
        this.bookingRepository = bookingRepository;
    }

    @Operation(summary = "System Admin xem booking toàn hệ thống")
    @GetMapping("/all")
    public List<BookingResponse> all(
            @RequestParam(required = false) BookingStatus status
    ) {
        if (status != null) {
            return bookingRepository.findAllByStatusOrderByCreatedAtDesc(status)
                    .stream()
                    .map(BookingResponse::from)
                    .toList();
        }
        return bookingRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream()
                .map(BookingResponse::from)
                .toList();
    }
}
