package com.smarthotel.hotel.room.repository;

import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.entity.RoomStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoomRepository extends JpaRepository<Room, UUID> {

    List<Room> findAllByHotelIdOrderByRoomNumberAsc(UUID hotelId);

    List<Room> findAllByHotelIdAndStatusOrderByRoomNumberAsc(
            UUID hotelId,
            RoomStatus status
    );

    List<Room> findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(
            UUID hotelId,
            UUID roomTypeId
    );

    List<Room> findAllByHotelIdAndRoomTypeIdAndStatusOrderByRoomNumberAsc(
            UUID hotelId,
            UUID roomTypeId,
            RoomStatus status
    );

    boolean existsByHotelIdAndRoomNumberIgnoreCase(
            UUID hotelId,
            String roomNumber
    );

    boolean existsByHotelIdAndRoomNumberIgnoreCaseAndIdNot(
            UUID hotelId,
            String roomNumber,
            UUID id
    );

    boolean existsByRoomTypeIdAndStatusNot(
            UUID roomTypeId,
            RoomStatus status
    );
}
