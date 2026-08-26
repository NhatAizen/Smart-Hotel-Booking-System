package com.smarthotel.booking.booking.roomchange;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoomChangeRequestRepository extends JpaRepository<RoomChangeRequest, UUID> {
    boolean existsByBookingIdAndStatus(UUID bookingId, RoomChangeRequestStatus status);
    List<RoomChangeRequest> findAllByCustomerIdOrderByRequestedAtDesc(UUID customerId);
    List<RoomChangeRequest> findAllByHotelIdOrderByRequestedAtDesc(UUID hotelId);
}
