package com.smarthotel.hotel.room.service;

import com.smarthotel.hotel.common.exception.DuplicateRoomNumberException;
import com.smarthotel.hotel.common.exception.HotelNotFoundException;
import com.smarthotel.hotel.common.exception.RoomNotFoundException;
import com.smarthotel.hotel.common.exception.RoomTypeNotFoundException;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import com.smarthotel.hotel.room.dto.CreateRoomRequest;
import com.smarthotel.hotel.room.dto.RoomResponse;
import com.smarthotel.hotel.room.dto.UpdateRoomRequest;
import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.entity.RoomStatus;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class RoomService {

    private final HotelRepository hotelRepository;
    private final RoomTypeRepository roomTypeRepository;
    private final RoomRepository roomRepository;

    public RoomService(
            HotelRepository hotelRepository,
            RoomTypeRepository roomTypeRepository,
            RoomRepository roomRepository
    ) {
        this.hotelRepository = hotelRepository;
        this.roomTypeRepository = roomTypeRepository;
        this.roomRepository = roomRepository;
    }

    @Transactional
    public RoomResponse create(
            UUID hotelId,
            CreateRoomRequest request
    ) {
        ensureHotelExists(hotelId);
        ensureRoomTypeBelongsToHotel(
                request.roomTypeId(),
                hotelId
        );

        String roomNumber = normalize(request.roomNumber());

        if (roomRepository.existsByHotelIdAndRoomNumberIgnoreCase(
                hotelId,
                roomNumber
        )) {
            throw new DuplicateRoomNumberException(roomNumber);
        }

        Room room = new Room(
                hotelId,
                request.roomTypeId(),
                roomNumber,
                request.floor(),
                request.customPrice(),
                normalizeNullable(request.note())
        );

        return RoomResponse.from(
                roomRepository.save(room)
        );
    }

    @Transactional(readOnly = true)
    public RoomResponse getById(UUID roomId) {
        return RoomResponse.from(findRoom(roomId));
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> getByHotel(
            UUID hotelId,
            UUID roomTypeId,
            RoomStatus status
    ) {
        ensureHotelExists(hotelId);

        List<Room> rooms;

        if (roomTypeId != null && status != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndRoomTypeIdAndStatusOrderByRoomNumberAsc(
                            hotelId,
                            roomTypeId,
                            status
                    );
        } else if (roomTypeId != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(
                            hotelId,
                            roomTypeId
                    );
        } else if (status != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndStatusOrderByRoomNumberAsc(
                            hotelId,
                            status
                    );
        } else {
            rooms = roomRepository
                    .findAllByHotelIdOrderByRoomNumberAsc(hotelId);
        }

        return rooms.stream()
                .map(RoomResponse::from)
                .toList();
    }

    @Transactional
    public RoomResponse update(
            UUID roomId,
            UpdateRoomRequest request
    ) {
        Room room = findRoom(roomId);

        ensureRoomTypeBelongsToHotel(
                request.roomTypeId(),
                room.getHotelId()
        );

        String roomNumber = normalize(request.roomNumber());

        if (roomRepository
                .existsByHotelIdAndRoomNumberIgnoreCaseAndIdNot(
                        room.getHotelId(),
                        roomNumber,
                        roomId
                )) {
            throw new DuplicateRoomNumberException(roomNumber);
        }

        room.update(
                request.roomTypeId(),
                roomNumber,
                request.floor(),
                request.status(),
                request.customPrice(),
                normalizeNullable(request.note())
        );

        return RoomResponse.from(room);
    }

    @Transactional
    public void delete(UUID roomId) {
        Room room = findRoom(roomId);
        room.deactivate();
    }

    private Room findRoom(UUID roomId) {
        return roomRepository
                .findById(roomId)
                .orElseThrow(
                        () -> new RoomNotFoundException(roomId)
                );
    }

    private void ensureHotelExists(UUID hotelId) {
        if (!hotelRepository.existsById(hotelId)) {
            throw new HotelNotFoundException(hotelId);
        }
    }

    private RoomType ensureRoomTypeBelongsToHotel(
            UUID roomTypeId,
            UUID hotelId
    ) {
        RoomType roomType = roomTypeRepository
                .findByIdAndHotelId(roomTypeId, hotelId)
                .orElseThrow(
                        () -> new RoomTypeNotFoundException(roomTypeId)
                );

        if (roomType.getStatus() != RoomTypeStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "Loại phòng đang ngừng hoạt động"
            );
        }

        return roomType;
    }

    private String normalize(String value) {
        return value.trim();
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
