package com.smarthotel.hotel.roomtype.repository;

import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomTypeRepository extends JpaRepository<RoomType, UUID> {

    List<RoomType> findAllByHotelIdAndStatusOrderByCreatedAtDesc(
            UUID hotelId,
            RoomTypeStatus status
    );

    List<RoomType> findAllByHotelIdOrderByCreatedAtDesc(UUID hotelId);

    Optional<RoomType> findByIdAndHotelId(UUID id, UUID hotelId);

    boolean existsByHotelIdAndNameIgnoreCase(UUID hotelId, String name);

    boolean existsByHotelIdAndNameIgnoreCaseAndIdNot(
            UUID hotelId,
            String name,
            UUID id
    );
}
