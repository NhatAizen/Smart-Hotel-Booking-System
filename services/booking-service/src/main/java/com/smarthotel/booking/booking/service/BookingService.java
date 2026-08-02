package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.dto.BookingResponse;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.common.exception.BookingNotFoundException;
import com.smarthotel.booking.common.exception.RoomAlreadyBookedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class BookingService {

    private final BookingRepository bookingRepository;

    public BookingService(
            BookingRepository bookingRepository
    ) {
        this.bookingRepository = bookingRepository;
    }

    @Transactional
    public BookingResponse create(
            CreateBookingRequest request
    ) {
        validateDateRange(
                request.checkIn(),
                request.checkOut()
        );

        if (bookingRepository.existsOverlappingBooking(
                request.roomId(),
                request.checkIn(),
                request.checkOut()
        )) {
            throw new RoomAlreadyBookedException();
        }

        Booking booking = new Booking(
                request.customerId(),
                request.hotelId(),
                request.roomId(),
                request.checkIn(),
                request.checkOut(),
                request.guestCount(),
                request.totalPrice(),
                normalizeNullable(request.specialRequest())
        );

        return BookingResponse.from(
                bookingRepository.save(booking)
        );
    }

    @Transactional(readOnly = true)
    public BookingResponse getById(UUID bookingId) {
        return BookingResponse.from(
                findBooking(bookingId)
        );
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByCustomer(
            UUID customerId
    ) {
        return bookingRepository
                .findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .map(BookingResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByHotel(
            UUID hotelId
    ) {
        return bookingRepository
                .findAllByHotelIdOrderByCreatedAtDesc(hotelId)
                .stream()
                .map(BookingResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getByStatus(
            BookingStatus status
    ) {
        return bookingRepository
                .findAllByStatusOrderByCreatedAtDesc(status)
                .stream()
                .map(BookingResponse::from)
                .toList();
    }

    @Transactional
    public BookingResponse confirm(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.confirm();
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse checkIn(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.checkIn();
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse checkOut(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.checkOut();
        return BookingResponse.from(booking);
    }

    @Transactional
    public BookingResponse cancel(UUID bookingId) {
        Booking booking = findBooking(bookingId);
        booking.cancel();
        return BookingResponse.from(booking);
    }

    private Booking findBooking(UUID bookingId) {
        return bookingRepository
                .findById(bookingId)
                .orElseThrow(
                        () -> new BookingNotFoundException(bookingId)
                );
    }

    private void validateDateRange(
            LocalDate checkIn,
            LocalDate checkOut
    ) {
        if (!checkOut.isAfter(checkIn)) {
            throw new IllegalArgumentException(
                    "NgÃ y tráº£ phÃ²ng pháº£i sau ngÃ y nháº­n phÃ²ng"
            );
        }
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}