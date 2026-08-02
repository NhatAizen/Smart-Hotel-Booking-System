package com.smarthotel.hotel.hotel.repository;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface HotelRepository extends JpaRepository<Hotel, UUID> {

    List<Hotel> findAllByStatusOrderByCreatedAtDesc(
            HotelStatus status
    );

    List<Hotel> findAllByCityIgnoreCaseAndStatusOrderByCreatedAtDesc(
            String city,
            HotelStatus status
    );

    List<Hotel> findAllByOwnerIdOrderByCreatedAtDesc(
            UUID ownerId
    );
}