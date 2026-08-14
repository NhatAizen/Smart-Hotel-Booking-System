package com.smarthotel.hotel.room.service;

import com.smarthotel.hotel.common.exception.DuplicateRoomNumberException;
import com.smarthotel.hotel.common.exception.RoomNotFoundException;
import com.smarthotel.hotel.common.exception.RoomTypeNotFoundException;
import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.integration.notification.NotificationClient;
import com.smarthotel.hotel.room.dto.BatchCreateRoomsRequest;
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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class RoomService {

    private final HotelService hotelService;
    private final RoomTypeRepository roomTypeRepository;
    private final RoomRepository roomRepository;
    private final NotificationClient notificationClient;

    public RoomService(
            HotelService hotelService,
            RoomTypeRepository roomTypeRepository,
            RoomRepository roomRepository,
            NotificationClient notificationClient
    ) {
        this.hotelService = hotelService;
        this.roomTypeRepository = roomTypeRepository;
        this.roomRepository = roomRepository;
        this.notificationClient = notificationClient;
    }

    @Transactional
    public RoomResponse create(
            UUID ownerId,
            UUID hotelId,
            CreateRoomRequest request
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);
        ensureRoomTypeBelongsToHotel(request.roomTypeId(), hotelId);

        String roomNumber = normalize(request.roomNumber());
        ensureUniqueRoomNumber(hotelId, roomNumber, null);

        Room room = new Room(
                hotelId,
                request.roomTypeId(),
                roomNumber,
                request.floor(),
                request.customPrice(),
                normalizeNullable(request.note())
        );

        return RoomResponse.from(roomRepository.save(room));
    }

    @Transactional
    public List<RoomResponse> createBatch(
            UUID ownerId,
            UUID hotelId,
            BatchCreateRoomsRequest request
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        Set<String> numbersInRequest = new HashSet<>();
        List<Room> rooms = new ArrayList<>();

        for (CreateRoomRequest item : request.rooms()) {
            ensureRoomTypeBelongsToHotel(item.roomTypeId(), hotelId);

            String roomNumber = normalize(item.roomNumber());
            String key = roomNumber.toLowerCase();

            if (!numbersInRequest.add(key)) {
                throw new DuplicateRoomNumberException(roomNumber);
            }

            ensureUniqueRoomNumber(hotelId, roomNumber, null);

            rooms.add(new Room(
                    hotelId,
                    item.roomTypeId(),
                    roomNumber,
                    item.floor(),
                    item.customPrice(),
                    normalizeNullable(item.note())
            ));
        }

        return roomRepository.saveAll(rooms)
                .stream()
                .map(RoomResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> getAvailableByHotel(
            UUID hotelId,
            UUID roomTypeId,
            RoomStatus status
    ) {
        hotelService.getPublicById(hotelId);

        if (status != null) {
            List<Room> rooms = roomTypeId == null
                    ? roomRepository.findAllByHotelIdAndStatusOrderByRoomNumberAsc(
                            hotelId, status
                    )
                    : roomRepository.findAllByHotelIdAndRoomTypeIdAndStatusOrderByRoomNumberAsc(
                            hotelId, roomTypeId, status
                    );
            return rooms.stream().map(RoomResponse::from).toList();
        }

        /*
         * Public search needs the physical rooms that can still be sold for a
         * future date. OCCUPIED/CLEANING describe the room right now, not all
         * future dates. Booking Service removes rooms whose bookings overlap
         * the requested stay. MAINTENANCE/INACTIVE remain excluded until Hotel
         * Admin explicitly re-opens them.
         */
        List<Room> rooms = roomTypeId == null
                ? roomRepository.findAllByHotelIdOrderByRoomNumberAsc(hotelId)
                : roomRepository.findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(
                        hotelId, roomTypeId
                );

        return rooms.stream()
                .filter(room -> room.getStatus() != RoomStatus.MAINTENANCE)
                .filter(room -> room.getStatus() != RoomStatus.INACTIVE)
                .map(RoomResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> getManagedByHotel(
            UUID ownerId,
            UUID hotelId,
            UUID roomTypeId,
            RoomStatus status
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        List<Room> rooms;

        if (roomTypeId != null && status != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndRoomTypeIdAndStatusOrderByRoomNumberAsc(
                            hotelId, roomTypeId, status
                    );
        } else if (roomTypeId != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(
                            hotelId, roomTypeId
                    );
        } else if (status != null) {
            rooms = roomRepository
                    .findAllByHotelIdAndStatusOrderByRoomNumberAsc(
                            hotelId, status
                    );
        } else {
            rooms = roomRepository.findAllByHotelIdOrderByRoomNumberAsc(hotelId);
        }

        return rooms.stream().map(RoomResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public RoomResponse getPublicById(UUID roomId) {
        Room room = findRoom(roomId);
        hotelService.getPublicById(room.getHotelId());
        return RoomResponse.from(room);
    }

    @Transactional
    public RoomResponse update(
            UUID ownerId,
            UUID roomId,
            UpdateRoomRequest request
    ) {
        Room room = findRoom(roomId);
        Hotel hotel = hotelService.getOwnedHotel(room.getHotelId(), ownerId);
        ensureRoomTypeBelongsToHotel(request.roomTypeId(), room.getHotelId());

        String roomNumber = normalize(request.roomNumber());
        ensureUniqueRoomNumber(room.getHotelId(), roomNumber, roomId);
        RoomStatus previousStatus = room.getStatus();

        room.update(
                request.roomTypeId(),
                roomNumber,
                request.floor(),
                request.status(),
                request.customPrice(),
                normalizeNullable(request.note())
        );

        if (previousStatus != request.status()) {
            if (request.status() == RoomStatus.CLEANING) {
                notificationClient.sendRoomCleaningRequired(
                        ownerId, room.getRoomNumber(), hotel.getName()
                );
            } else if (previousStatus == RoomStatus.CLEANING
                    && request.status() == RoomStatus.AVAILABLE) {
                notificationClient.sendRoomReady(
                        ownerId, room.getRoomNumber(), hotel.getName()
                );
            }
        }

        return RoomResponse.from(room);
    }

    @Transactional
    public RoomResponse completeCleaning(UUID ownerId, UUID roomId) {
        Room room = findRoom(roomId);
        Hotel hotel = hotelService.getOwnedHotel(room.getHotelId(), ownerId);

        if (room.getStatus() != RoomStatus.CLEANING) {
            throw new IllegalArgumentException(
                    "Chỉ phòng đang dọn mới có thể xác nhận dọn xong"
            );
        }

        room.completeCleaning();
        notificationClient.sendRoomReady(
                ownerId, room.getRoomNumber(), hotel.getName()
        );

        return RoomResponse.from(room);
    }

    @Transactional
    public void delete(UUID ownerId, UUID roomId) {
        Room room = findRoom(roomId);
        hotelService.getOwnedHotel(room.getHotelId(), ownerId);
        room.deactivate();
    }

    private Room findRoom(UUID roomId) {
        return roomRepository
                .findById(roomId)
                .orElseThrow(() -> new RoomNotFoundException(roomId));
    }

    private RoomType ensureRoomTypeBelongsToHotel(
            UUID roomTypeId,
            UUID hotelId
    ) {
        RoomType roomType = roomTypeRepository
                .findById(roomTypeId)
                .filter(item -> item.getHotelId().equals(hotelId))
                .orElseThrow(() -> new RoomTypeNotFoundException(roomTypeId));

        if (roomType.getStatus() != RoomTypeStatus.ACTIVE) {
            throw new IllegalArgumentException("Loại phòng đang ngừng hoạt động");
        }

        return roomType;
    }

    private void ensureUniqueRoomNumber(
            UUID hotelId,
            String roomNumber,
            UUID excludedId
    ) {
        boolean exists = excludedId == null
                ? roomRepository.existsByHotelIdAndRoomNumberIgnoreCase(
                        hotelId, roomNumber
                )
                : roomRepository.existsByHotelIdAndRoomNumberIgnoreCaseAndIdNot(
                        hotelId, roomNumber, excludedId
                );

        if (exists) {
            throw new DuplicateRoomNumberException(roomNumber);
        }
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Giá trị không được để trống");
        }
        return value.trim();
    }

    private String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
