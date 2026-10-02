package com.smarthotel.booking.booking.roomchange;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

import java.util.List;
import java.util.UUID;

public interface RoomChangeRequestRepository extends JpaRepository<RoomChangeRequest, UUID> {
    @Query("select r.bookingId from RoomChangeRequest r where r.id = :id")
    Optional<UUID> findBookingId(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RoomChangeRequest r where r.id = :id")
    Optional<RoomChangeRequest> findForUpdate(@Param("id") UUID id);
    boolean existsByBookingIdAndStatus(UUID bookingId, RoomChangeRequestStatus status);
    List<RoomChangeRequest> findAllByCustomerIdOrderByRequestedAtDesc(UUID customerId);
    List<RoomChangeRequest> findAllByHotelIdOrderByRequestedAtDesc(UUID hotelId);
}
