package com.smarthotel.booking.pricing.repository;

import com.smarthotel.booking.pricing.entity.BookingNightPrice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BookingNightPriceRepository extends JpaRepository<BookingNightPrice, UUID> {
    List<BookingNightPrice> findAllByBookingIdOrderByStayDateAsc(UUID bookingId);
}
