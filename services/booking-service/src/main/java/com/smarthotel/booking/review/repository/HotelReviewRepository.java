package com.smarthotel.booking.review.repository;

import com.smarthotel.booking.review.entity.HotelReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HotelReviewRepository extends JpaRepository<HotelReview, UUID> {
    boolean existsByBookingId(UUID bookingId);
    Optional<HotelReview> findByBookingId(UUID bookingId);
    List<HotelReview> findAllByHotelIdOrderByCreatedAtDesc(UUID hotelId);
    List<HotelReview> findAllByCustomerIdOrderByCreatedAtDesc(UUID customerId);
}
