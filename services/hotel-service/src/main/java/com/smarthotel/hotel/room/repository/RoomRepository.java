package com.smarthotel.hotel.room.repository;

import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.entity.RoomStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoomRepository extends JpaRepository<Room, UUID> {
    boolean existsByHotelIdAndRoomNumberIgnoreCase(UUID hotelId, String roomNumber);

    boolean existsByHotelIdAndRoomNumberIgnoreCaseAndIdNot(
            UUID hotelId,
            String roomNumber,
            UUID roomId
    );

    List<Room> findAllByHotelIdOrderByRoomNumberAsc(UUID hotelId);

    List<Room> findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(
            UUID hotelId,
            UUID roomTypeId
    );

    List<Room> findAllByHotelIdAndStatusOrderByRoomNumberAsc(
            UUID hotelId,
            RoomStatus status
    );

    List<Room> findAllByHotelIdAndRoomTypeIdAndStatusOrderByRoomNumberAsc(
            UUID hotelId,
            UUID roomTypeId,
            RoomStatus status
    );

    long countByHotelId(UUID hotelId);
    long countByRoomTypeId(UUID roomTypeId);
    long countByRoomTypeIdAndStatus(UUID roomTypeId, RoomStatus status);
}
