package com.smarthotel.hotel.roomtype.service;

import com.smarthotel.hotel.common.exception.DuplicateRoomTypeNameException;
import com.smarthotel.hotel.common.exception.RoomTypeNotFoundException;
import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.integration.notification.NotificationClient;
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

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class RoomTypeService {

    private final RoomTypeRepository roomTypeRepository;
    private final RoomTypeImageRepository imageRepository;
    private final RoomRepository roomRepository;
    private final HotelService hotelService;
    private final MediaStorageService mediaStorageService;
    private final NotificationClient notificationClient;

    public RoomTypeService(
            RoomTypeRepository roomTypeRepository,
            RoomTypeImageRepository imageRepository,
            RoomRepository roomRepository,
            HotelService hotelService,
            MediaStorageService mediaStorageService,
            NotificationClient notificationClient
    ) {
        this.roomTypeRepository = roomTypeRepository;
        this.imageRepository = imageRepository;
        this.roomRepository = roomRepository;
        this.hotelService = hotelService;
        this.mediaStorageService = mediaStorageService;
        this.notificationClient = notificationClient;
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

        boolean requiresReapproval = requiresReapproval(roomType, request, name);

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
                request.status(),
                requiresReapproval
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
        notificationClient.sendRole(
                "SYSTEM_ADMIN",
                "Có loại phòng chờ duyệt",
                "Loại phòng " + roomType.getName() + " của khách sạn " + hotel.getName() + " vừa được gửi xét duyệt.",
                "ROOM_TYPE_SUBMITTED",
                "HOTEL",
                "/admin/room-types"
        );
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
        var hotel = hotelService.findHotel(roomType.getHotelId());
        if (hotel.getOwnerId() != null) {
            notificationClient.sendUser(
                    hotel.getOwnerId(),
                    "Loại phòng đã được duyệt",
                    "Loại phòng " + roomType.getName() + " của khách sạn " + hotel.getName() + " đã được duyệt.",
                    "ROOM_TYPE_APPROVED",
                    "HOTEL",
                    "/hotel-admin/room-types"
            );
        }
        return toResponse(roomType);
    }

    @Transactional
    public RoomTypeResponse reject(UUID roomTypeId, UUID systemAdminId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Vui lòng nhập lý do từ chối");
        }
        RoomType roomType = find(roomTypeId);
        roomType.reject(systemAdminId, reason.trim());
        var hotel = hotelService.findHotel(roomType.getHotelId());
        if (hotel.getOwnerId() != null) {
            notificationClient.sendUser(
                    hotel.getOwnerId(),
                    "Loại phòng bị từ chối",
                    "Loại phòng " + roomType.getName() + " của khách sạn " + hotel.getName()
                            + " bị từ chối. Lý do: " + reason.trim(),
                    "ROOM_TYPE_REJECTED",
                    "HOTEL",
                    "/hotel-admin/room-types"
            );
        }
        return toResponse(roomType);
    }

    private boolean requiresReapproval(
            RoomType current,
            UpdateRoomTypeRequest request,
            String normalizedName
    ) {
        if (current.getApprovalStatus() != RoomTypeApprovalStatus.APPROVED) {
            return false;
        }

        if (!Objects.equals(current.getName(), normalizedName)) {
            return true;
        }

        BigDecimal approvedPrice = current.getApprovedBasePrice() != null
                ? current.getApprovedBasePrice()
                : current.getBasePrice();

        if (approvedPrice != null && request.basePrice() != null) {
            BigDecimal reviewThreshold = approvedPrice.multiply(new BigDecimal("1.25"));
            if (request.basePrice().compareTo(reviewThreshold) > 0) {
                return true;
            }
        }

        if (!Objects.equals(current.getMaxAdults(), request.maxAdults())
                || !Objects.equals(current.getMaxChildren(), request.maxChildren())
                || !sameText(current.getBedType(), request.bedType())
                || !Objects.equals(current.getBedCount(), request.bedCount())
                || !sameDecimal(current.getAreaSqm(), request.areaSqm())) {
            return true;
        }

        return current.isRefundable() != request.refundable()
                || current.isPayAtHotelAllowed() != request.payAtHotelAllowed()
                || current.isDepositAllowed() != request.depositAllowed()
                || !Objects.equals(current.getDepositPercent(), request.depositPercent())
                || current.isFullPaymentAllowed() != request.fullPaymentAllowed();
    }

    private boolean sameText(String left, String right) {
        return Objects.equals(normalizeNullable(left), normalizeNullable(right));
    }

    private boolean sameDecimal(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return left == null && right == null;
        }
        return left.compareTo(right) == 0;
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
