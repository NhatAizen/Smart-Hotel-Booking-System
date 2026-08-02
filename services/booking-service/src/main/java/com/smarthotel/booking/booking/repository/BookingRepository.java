package com.smarthotel.booking.booking.repository;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface BookingRepository extends JpaRepository<Booking, UUID> {

    List<Booking> findAllByCustomerIdOrderByCreatedAtDesc(
            UUID customerId
    );

    List<Booking> findAllByHotelIdOrderByCreatedAtDesc(
            UUID hotelId
    );

    List<Booking> findAllByStatusOrderByCreatedAtDesc(
            BookingStatus status
    );

    @Query("""
            SELECT COUNT(b) > 0
            FROM Booking b
            WHERE b.roomId = :roomId
              AND b.status <> com.smarthotel.booking.booking.entity.BookingStatus.CANCELLED
              AND b.checkIn < :checkOut
              AND b.checkOut > :checkIn
            """)
    boolean existsOverlappingBooking(
            @Param("roomId") UUID roomId,
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut
    );
}