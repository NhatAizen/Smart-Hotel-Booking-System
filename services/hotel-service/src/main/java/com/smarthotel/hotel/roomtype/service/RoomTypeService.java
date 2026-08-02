package com.smarthotel.hotel.roomtype.service;

import com.smarthotel.hotel.common.exception.DuplicateRoomTypeNameException;
import com.smarthotel.hotel.common.exception.HotelNotFoundException;
import com.smarthotel.hotel.common.exception.RoomTypeNotFoundException;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.dto.CreateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.dto.RoomTypeResponse;
import com.smarthotel.hotel.roomtype.dto.UpdateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class RoomTypeService {

    private final HotelRepository hotelRepository;
    private final RoomTypeRepository roomTypeRepository;
    private final RoomRepository roomRepository;

    public RoomTypeService(
            HotelRepository hotelRepository,
            RoomTypeRepository roomTypeRepository,
            RoomRepository roomRepository
    ) {
        this.hotelRepository = hotelRepository;
        this.roomTypeRepository = roomTypeRepository;
        this.roomRepository = roomRepository;
    }

    @Transactional
    public RoomTypeResponse create(
            UUID hotelId,
            CreateRoomTypeRequest request
    ) {
        ensureHotelExists(hotelId);

        String normalizedName = normalize(request.name());

        if (roomTypeRepository.existsByHotelIdAndNameIgnoreCase(
                hotelId,
                normalizedName
        )) {
            throw new DuplicateRoomTypeNameException(normalizedName);
        }

        RoomType roomType = new RoomType(
                hotelId,
                normalizedName,
                normalizeNullable(request.description()),
                request.basePrice(),
                request.maxAdults(),
                request.maxChildren(),
                normalizeNullable(request.bedType()),
                request.areaSqm()
        );

        return RoomTypeResponse.from(
                roomTypeRepository.save(roomType)
        );
    }

    @Transactional(readOnly = true)
    public RoomTypeResponse getById(UUID roomTypeId) {
        return RoomTypeResponse.from(
                findRoomType(roomTypeId)
        );
    }

    @Transactional(readOnly = true)
    public List<RoomTypeResponse> getByHotel(
            UUID hotelId,
            RoomTypeStatus status
    ) {
        ensureHotelExists(hotelId);

        List<RoomType> roomTypes =
                status == null
                        ? roomTypeRepository
                                .findAllByHotelIdOrderByCreatedAtDesc(hotelId)
                        : roomTypeRepository
                                .findAllByHotelIdAndStatusOrderByCreatedAtDesc(
                                        hotelId,
                                        status
                                );

        return roomTypes.stream()
                .map(RoomTypeResponse::from)
                .toList();
    }

    @Transactional
    public RoomTypeResponse update(
            UUID roomTypeId,
            UpdateRoomTypeRequest request
    ) {
        RoomType roomType = findRoomType(roomTypeId);
        String normalizedName = normalize(request.name());

        if (roomTypeRepository
                .existsByHotelIdAndNameIgnoreCaseAndIdNot(
                        roomType.getHotelId(),
                        normalizedName,
                        roomTypeId
                )) {
            throw new DuplicateRoomTypeNameException(normalizedName);
        }

        roomType.update(
                normalizedName,
                normalizeNullable(request.description()),
                request.basePrice(),
                request.maxAdults(),
                request.maxChildren(),
                normalizeNullable(request.bedType()),
                request.areaSqm(),
                request.status()
        );

        return RoomTypeResponse.from(roomType);
    }

    @Transactional
    public void delete(UUID roomTypeId) {
        RoomType roomType = findRoomType(roomTypeId);

        if (roomRepository.existsByRoomTypeIdAndStatusNot(
                roomTypeId,
                com.smarthotel.hotel.room.entity.RoomStatus.INACTIVE
        )) {
            throw new IllegalArgumentException(
                    "Không thể ngừng loại phòng khi vẫn còn phòng đang hoạt động"
            );
        }

        roomType.deactivate();
    }

    private RoomType findRoomType(UUID roomTypeId) {
        return roomTypeRepository
                .findById(roomTypeId)
                .orElseThrow(
                        () -> new RoomTypeNotFoundException(roomTypeId)
                );
    }

    private void ensureHotelExists(UUID hotelId) {
        if (!hotelRepository.existsById(hotelId)) {
            throw new HotelNotFoundException(hotelId);
        }
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
