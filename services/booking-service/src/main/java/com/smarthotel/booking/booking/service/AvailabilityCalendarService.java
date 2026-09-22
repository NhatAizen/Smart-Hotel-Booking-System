package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.dto.AvailabilityCalendarResponse;
import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class AvailabilityCalendarService {

    private static final long MAX_RANGE_DAYS = 62;

    private final BookingRepository bookingRepository;
    private final HotelClient hotelClient;
    private final RoomHoldService roomHoldService;

    public AvailabilityCalendarService(
            BookingRepository bookingRepository,
            HotelClient hotelClient,
            RoomHoldService roomHoldService
    ) {
        this.bookingRepository = bookingRepository;
        this.hotelClient = hotelClient;
        this.roomHoldService = roomHoldService;
    }

    @Transactional(readOnly = true)
    public AvailabilityCalendarResponse getCalendar(
            UUID hotelAdminId,
            UUID hotelId,
            LocalDate from,
            LocalDate to,
            String bearerToken
    ) {
        validateRange(from, to);

        HotelClient.HotelDetails hotel = hotelClient.getManagedHotel(hotelId, bearerToken);
        if (hotel.ownerId() == null || !hotel.ownerId().equals(hotelAdminId)) {
            throw new AccessDeniedException("Bạn không có quyền xem lịch của khách sạn này");
        }

        LocalDate rangeEndExclusive = to.plusDays(1);
        List<AvailabilityCalendarResponse.RoomItem> rooms = hotelClient
                .getManagedRooms(hotelId, bearerToken)
                .stream()
                .map(room -> new AvailabilityCalendarResponse.RoomItem(
                        room.id(),
                        room.roomTypeId(),
                        room.roomNumber(),
                        room.floor(),
                        room.status(),
                        room.customPrice(),
                        room.note()
                ))
                .toList();

        List<AvailabilityCalendarResponse.BookingItem> bookings = bookingRepository
                .findCalendarBookings(hotelId, from, rangeEndExclusive, Instant.now())
                .stream()
                .map(this::toBookingItem)
                .toList();

        List<AvailabilityCalendarResponse.HoldItem> holds = roomHoldService
                .findActiveCalendarHolds(hotelId, from, rangeEndExclusive)
                .stream()
                .map(hold -> new AvailabilityCalendarResponse.HoldItem(
                        hold.roomId(),
                        hold.checkIn(),
                        hold.checkOut(),
                        hold.expiresAt()
                ))
                .toList();

        return new AvailabilityCalendarResponse(
                hotel.id(),
                hotel.name(),
                from,
                to,
                Instant.now(),
                rooms,
                bookings,
                holds
        );
    }

    private AvailabilityCalendarResponse.BookingItem toBookingItem(Booking booking) {
        String guestName = String.join(" ", List.of(
                        safe(booking.getGuestLastName()),
                        safe(booking.getGuestFirstName())
                ))
                .trim()
                .replaceAll("\\s+", " ");
        if (guestName.isBlank()) {
            guestName = String.join(" ", List.of(
                            safe(booking.getBookerLastName()),
                            safe(booking.getBookerFirstName())
                    ))
                    .trim()
                    .replaceAll("\\s+", " ");
        }

        return new AvailabilityCalendarResponse.BookingItem(
                booking.getId(),
                booking.getBookingCode(),
                booking.getRoomId(),
                booking.getCheckIn(),
                booking.getCheckOut(),
                booking.getStatus(),
                guestName,
                booking.getGuestCount(),
                booking.getCheckedInAt(),
                booking.getCheckedOutAt()
        );
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("Khoảng ngày lịch phòng không được để trống");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("Ngày kết thúc lịch phải từ ngày bắt đầu trở đi");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_RANGE_DAYS) {
            throw new IllegalArgumentException("Mỗi lần chỉ xem tối đa 62 ngày");
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
