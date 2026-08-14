package com.smarthotel.hotel.media.repository;

import com.smarthotel.hotel.media.entity.RoomTypeImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomTypeImageRepository extends JpaRepository<RoomTypeImage, UUID> {
    List<RoomTypeImage> findAllByRoomTypeIdOrderBySortOrderAscCreatedAtAsc(UUID roomTypeId);
    Optional<RoomTypeImage> findByIdAndRoomTypeId(UUID id, UUID roomTypeId);
    long countByRoomTypeId(UUID roomTypeId);
}
