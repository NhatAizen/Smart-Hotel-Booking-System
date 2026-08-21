package com.smarthotel.booking.booking.repository;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BookingRepository extends JpaRepository<Booking, UUID> {

    List<Booking> findAllByCustomerIdAndCustomerHiddenFalseOrderByCreatedAtDesc(
            UUID customerId
    );

    List<Booking> findAllByHotelIdOrderByCreatedAtDesc(UUID hotelId);
    @Query(value = """
            SELECT COUNT(DISTINCT COALESCE(booking_group_id, id))
            FROM bookings
            WHERE customer_id = :customerId
              AND status = 'CHECKED_OUT'
            """, nativeQuery = true)
    long countCompletedBookingGroups(@Param("customerId") UUID customerId);


    List<Booking> findAllByStatusOrderByCreatedAtDesc(BookingStatus status);

    long countByHotelIdInAndStatus(
            Collection<UUID> hotelIds,
            BookingStatus status
    );

    @Query("""
            SELECT COUNT(b)
            FROM Booking b
            WHERE b.hotelId IN :hotelIds
              AND b.checkOut > :today
              AND (
                    b.status IN :actionableStatuses
                    OR (
                        b.status = com.smarthotel.booking.booking.entity.BookingStatus.PENDING_PAYMENT
                        AND (
                            b.paymentExpiresAt IS NULL
                            OR b.paymentExpiresAt > :now
                        )
                    )
              )
            """)
    long countActionableBookings(
            @Param("hotelIds") Collection<UUID> hotelIds,
            @Param("actionableStatuses") Collection<BookingStatus> actionableStatuses,
            @Param("now") Instant now,
            @Param("today") LocalDate today
    );

    Optional<Booking> findByCheckInCode(String checkInCode);

    List<Booking> findAllByBookingGroupId(UUID bookingGroupId);

    @Query("""
            SELECT b
            FROM Booking b
            WHERE b.status = com.smarthotel.booking.booking.entity.BookingStatus.PENDING_PAYMENT
              AND b.paymentExpiresAt IS NOT NULL
              AND b.paymentExpiresAt <= :now
            ORDER BY b.paymentExpiresAt ASC
            """)
    List<Booking> findExpiredPendingPayments(@Param("now") Instant now);

    @Query("""
            SELECT b
            FROM Booking b
            WHERE b.hotelId = :hotelId
              AND b.status = com.smarthotel.booking.booking.entity.BookingStatus.PENDING_PAYMENT
              AND b.paymentExpiresAt IS NOT NULL
              AND b.paymentExpiresAt > :now
              AND b.checkIn < :checkOut
              AND b.checkOut > :checkIn
            """)
    List<Booking> findActivePendingPayments(
            @Param("hotelId") UUID hotelId,
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut,
            @Param("now") Instant now
    );

    @Query("""
            SELECT COUNT(b) > 0
            FROM Booking b
            WHERE b.roomId = :roomId
              AND b.status NOT IN (
                    com.smarthotel.booking.booking.entity.BookingStatus.CANCELLED,
                    com.smarthotel.booking.booking.entity.BookingStatus.NO_SHOW
              )
              AND (
                    b.status <> com.smarthotel.booking.booking.entity.BookingStatus.PENDING_PAYMENT
                    OR b.paymentExpiresAt IS NULL
                    OR b.paymentExpiresAt > :now
              )
              AND b.checkIn < :checkOut
              AND b.checkOut > :checkIn
            """)
    boolean existsOverlappingBooking(
            @Param("roomId") UUID roomId,
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut,
            @Param("now") Instant now
    );

    @Query("""
            SELECT DISTINCT b.roomId
            FROM Booking b
            WHERE b.hotelId = :hotelId
              AND b.status NOT IN (
                    com.smarthotel.booking.booking.entity.BookingStatus.CANCELLED,
                    com.smarthotel.booking.booking.entity.BookingStatus.NO_SHOW
              )
              AND (
                    b.status <> com.smarthotel.booking.booking.entity.BookingStatus.PENDING_PAYMENT
                    OR b.paymentExpiresAt IS NULL
                    OR b.paymentExpiresAt > :now
              )
              AND b.checkIn < :checkOut
              AND b.checkOut > :checkIn
            """)
    List<UUID> findUnavailableRoomIds(
            @Param("hotelId") UUID hotelId,
            @Param("checkIn") LocalDate checkIn,
            @Param("checkOut") LocalDate checkOut,
            @Param("now") Instant now
    );
}
