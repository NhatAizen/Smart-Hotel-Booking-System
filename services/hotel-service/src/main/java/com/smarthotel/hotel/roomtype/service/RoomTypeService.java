package com.smarthotel.hotel.roomtype.service;

import com.smarthotel.hotel.common.exception.DuplicateRoomTypeNameException;
import com.smarthotel.hotel.common.exception.RoomTypeNotFoundException;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.hotel.entity.HotelApprovalStatus;
import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.media.repository.RoomTypeImageRepository;
import com.smarthotel.hotel.media.service.MediaStorageService;
import com.smarthotel.hotel.room.entity.RoomStatus;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.dto.CreateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.dto.RoomTypeResponse;
import com.smarthotel.hotel.roomtype.dto.UpdateRoomTypeRequest;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.entity.RoomTypeApprovalStatus;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class RoomTypeService {

    private final RoomTypeRepository roomTypeRepository;
    private final RoomTypeImageRepository imageRepository;
    private final RoomRepository roomRepository;
    private final HotelService hotelService;
    private final MediaStorageService mediaStorageService;

    public RoomTypeService(
            RoomTypeRepository roomTypeRepository,
            RoomTypeImageRepository imageRepository,
            RoomRepository roomRepository,
            HotelService hotelService,
            MediaStorageService mediaStorageService
    ) {
        this.roomTypeRepository = roomTypeRepository;
        this.imageRepository = imageRepository;
        this.roomRepository = roomRepository;
        this.hotelService = hotelService;
        this.mediaStorageService = mediaStorageService;
    }

    @Transactional
    public RoomTypeResponse create(
            UUID ownerId,
            UUID hotelId,
            CreateRoomTypeRequest request
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        String name = normalize(request.name());

        if (roomTypeRepository.existsByHotelIdAndNameIgnoreCase(hotelId, name)) {
            throw new DuplicateRoomTypeNameException(name);
        }

        RoomType roomType = new RoomType(
                hotelId,
                name,
                normalizeNullable(request.description()),
                request.basePrice(),
                request.maxAdults(),
                request.maxChildren(),
                normalizeNullable(request.bedType()),
                request.bedCount(),
                request.areaSqm(),
                request.breakfastIncluded(),
                request.refundable(),
                request.smokingAllowed(),
                request.payAtHotelAllowed(),
                request.depositAllowed(),
                request.depositPercent(),
                request.fullPaymentAllowed(),
                normalizeAmenities(request.amenities())
        );

        return toResponse(roomTypeRepository.save(roomType));
    }

    @Transactional(readOnly = true)
    public List<RoomTypeResponse> getPublicByHotel(UUID hotelId) {
        hotelService.getPublicById(hotelId);

        return roomTypeRepository
                .findAllByHotelIdAndStatusAndApprovalStatusOrderByCreatedAtAsc(
                        hotelId,
                        RoomTypeStatus.ACTIVE,
                        RoomTypeApprovalStatus.APPROVED
                )
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoomTypeResponse> getManagedByHotel(
            UUID ownerId,
            UUID hotelId
    ) {
        hotelService.getOwnedHotel(hotelId, ownerId);

        return roomTypeRepository
                .findAllByHotelIdOrderByCreatedAtAsc(hotelId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RoomTypeResponse getPublicById(UUID roomTypeId) {
        RoomType roomType = find(roomTypeId);
        hotelService.getPublicById(roomType.getHotelId());

        if (roomType.getStatus() != RoomTypeStatus.ACTIVE || roomType.getApprovalStatus() != RoomTypeApprovalStatus.APPROVED) {
            throw new RoomTypeNotFoundException(roomTypeId);
        }

        return toResponse(roomType);
    }

    @Transactional(readOnly = true)
    public RoomTypeResponse getManagedById(UUID ownerId, UUID roomTypeId) {
        return toResponse(getOwnedRoomType(ownerId, roomTypeId));
    }

    @Transactional
    public RoomTypeResponse update(
            UUID ownerId,
            UUID roomTypeId,
            UpdateRoomTypeRequest request
    ) {
        RoomType roomType = getOwnedRoomType(ownerId, roomTypeId);
        String name = normalize(request.name());

        if (roomTypeRepository.existsByHotelIdAndNameIgnoreCaseAndIdNot(
                roomType.getHotelId(),
                name,
                roomTypeId
        )) {
            throw new DuplicateRoomTypeNameException(name);
        }

        roomType.update(
                name,
                normalizeNullable(request.description()),
                request.basePrice(),
                request.maxAdults(),
                request.maxChildren(),
                normalizeNullable(request.bedType()),
                request.bedCount(),
                request.areaSqm(),
                request.breakfastIncluded(),
                request.refundable(),
                request.smokingAllowed(),
                request.payAtHotelAllowed(),
                request.depositAllowed(),
                request.depositPercent(),
                request.fullPaymentAllowed(),
                normalizeAmenities(request.amenities()),
                request.status()
        );

        return toResponse(roomType);
    }

    @Transactional
    public RoomTypeResponse submit(UUID ownerId, UUID roomTypeId) {
        RoomType roomType = getOwnedRoomType(ownerId, roomTypeId);
        var hotel = hotelService.getOwnedHotel(roomType.getHotelId(), ownerId);
        if (hotel.getApprovalStatus() != HotelApprovalStatus.APPROVED) {
            throw new IllegalStateException("Khách sạn phải được duyệt trước khi gửi loại phòng để xét duyệt");
        }
        if (roomType.getStatus() != RoomTypeStatus.ACTIVE) {
            throw new IllegalStateException("Loại phòng đang ngừng hoạt động");
        }
        roomType.submitForApproval();
        return toResponse(roomType);
    }

    @Transactional(readOnly = true)
    public List<RoomTypeResponse> getPendingForAdmin() {
        return roomTypeRepository
                .findAllByApprovalStatusOrderBySubmittedAtAsc(RoomTypeApprovalStatus.PENDING)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public RoomTypeResponse approve(UUID roomTypeId, UUID systemAdminId) {
        RoomType roomType = find(roomTypeId);
        roomType.approve(systemAdminId);
        return toResponse(roomType);
    }

    @Transactional
    public RoomTypeResponse reject(UUID roomTypeId, UUID systemAdminId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Vui lòng nhập lý do từ chối");
        }
        RoomType roomType = find(roomTypeId);
        roomType.reject(systemAdminId, reason.trim());
        return toResponse(roomType);
    }

    @Transactional
    public void delete(UUID ownerId, UUID roomTypeId) {
        RoomType roomType = getOwnedRoomType(ownerId, roomTypeId);
        roomType.deactivate();
    }

    @Transactional(readOnly = true)
    public RoomType getOwnedRoomType(UUID ownerId, UUID roomTypeId) {
        RoomType roomType = find(roomTypeId);
        hotelService.getOwnedHotel(roomType.getHotelId(), ownerId);
        return roomType;
    }

    @Transactional(readOnly = true)
    public RoomType find(UUID roomTypeId) {
        return roomTypeRepository
                .findById(roomTypeId)
                .orElseThrow(() -> new RoomTypeNotFoundException(roomTypeId));
    }

    private RoomTypeResponse toResponse(RoomType roomType) {
        List<ImageResponse> images = imageRepository
                .findAllByRoomTypeIdOrderBySortOrderAscCreatedAtAsc(roomType.getId())
                .stream()
                .map(image -> ImageResponse.from(
                        image,
                        mediaStorageService.publicUrl(image.getFileName())
                ))
                .toList();

        return RoomTypeResponse.from(
                roomType,
                images,
                roomRepository.countByRoomTypeId(roomType.getId()),
                roomRepository.countByRoomTypeIdAndStatus(
                        roomType.getId(),
                        RoomStatus.AVAILABLE
                )
        );
    }

    private String normalize(String value) {
        return value.trim();
    }

    private String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Set<String> normalizeAmenities(Set<String> values) {
        if (values == null) {
            return Set.of();
        }

        Set<String> normalized = new LinkedHashSet<>();
        values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .forEach(normalized::add);
        return normalized;
    }
}
