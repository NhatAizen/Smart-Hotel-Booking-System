package com.smarthotel.hotel.media.repository;

import com.smarthotel.hotel.media.entity.HotelImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HotelImageRepository extends JpaRepository<HotelImage, UUID> {
    List<HotelImage> findAllByHotelIdOrderBySortOrderAscCreatedAtAsc(UUID hotelId);
    Optional<HotelImage> findByIdAndHotelId(UUID id, UUID hotelId);
    long countByHotelId(UUID hotelId);
}
