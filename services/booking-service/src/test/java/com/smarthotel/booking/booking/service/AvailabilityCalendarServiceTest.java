package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AvailabilityCalendarServiceTest {
    @Mock BookingRepository bookingRepository;
    @Mock HotelClient hotelClient;
    @Mock RoomHoldService roomHoldService;
    @InjectMocks AvailabilityCalendarService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID hotelId = UUID.randomUUID();
    private final LocalDate from = LocalDate.of(2026, 9, 19);

    @Test
    void rejectsOtherOwnerBeforeReadingRoomsBookingsOrHolds() {
        when(hotelClient.getManagedHotel(hotelId, "token")).thenReturn(hotel(UUID.randomUUID()));

        assertThatThrownBy(() -> service.getCalendar(ownerId, hotelId, from, from.plusDays(6), "token"))
                .isInstanceOf(AccessDeniedException.class);

        verifyNoInteractions(bookingRepository, roomHoldService);
    }

    @Test
    void usesExclusiveEndAndReturnsRoomBookingAndHold() {
        UUID roomId = UUID.randomUUID();
        UUID roomTypeId = UUID.randomUUID();
        Booking booking = org.mockito.Mockito.mock(Booking.class);
        when(hotelClient.getManagedHotel(hotelId, "token")).thenReturn(hotel(ownerId));
        when(hotelClient.getManagedRooms(hotelId, "token")).thenReturn(List.of(
                new HotelClient.RoomDetails(roomId, hotelId, roomTypeId, "101", 1,
                        "CLEANING", null, null)));
        when(bookingRepository.findCalendarBookings(eq(hotelId), eq(from),
                eq(from.plusDays(7)), any(Instant.class))).thenReturn(List.of(booking));
        when(booking.getId()).thenReturn(UUID.randomUUID());
        when(booking.getRoomId()).thenReturn(roomId);
        when(booking.getCheckIn()).thenReturn(from);
        when(booking.getCheckOut()).thenReturn(from.plusDays(2));
        when(booking.getStatus()).thenReturn(BookingStatus.CHECKED_OUT);
        when(roomHoldService.findActiveCalendarHolds(hotelId, from, from.plusDays(7)))
                .thenReturn(List.of(new RoomHoldService.CalendarHold(
                        roomId, from.plusDays(3), from.plusDays(4), Instant.now().plusSeconds(60))));

        var result = service.getCalendar(ownerId, hotelId, from, from.plusDays(6), "token");

        assertThat(result.rooms()).singleElement().satisfies(room ->
                assertThat(room.status()).isEqualTo("CLEANING"));
        assertThat(result.bookings()).singleElement().satisfies(item -> {
            assertThat(item.status()).isEqualTo(BookingStatus.CHECKED_OUT);
            assertThat(item.checkOut()).isEqualTo(from.plusDays(2));
        });
        assertThat(result.holds()).singleElement().satisfies(hold ->
                assertThat(hold.checkIn()).isEqualTo(from.plusDays(3)));
        verify(bookingRepository).findCalendarBookings(eq(hotelId), eq(from),
                eq(from.plusDays(7)), any(Instant.class));
    }

    @Test
    void rejectsReversedAndOversizedRangesBeforeRemoteCalls() {
        assertThatThrownBy(() -> service.getCalendar(ownerId, hotelId, from, from.minusDays(1), "token"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getCalendar(ownerId, hotelId, from, from.plusDays(62), "token"))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(hotelClient, bookingRepository, roomHoldService);
    }

    private HotelClient.HotelDetails hotel(UUID owner) {
        return new HotelClient.HotelDetails(hotelId, owner, "Enziu", null, null, null, null);
    }
}
