package com.smarthotel.hotel.hotel.service;

import com.smarthotel.hotel.integration.notification.NotificationClient;
import com.smarthotel.hotel.integration.geocoding.GeocodingAttempt;
import com.smarthotel.hotel.integration.geocoding.NominatimGeocodingClient;

import com.smarthotel.hotel.common.exception.HotelNotFoundException;
import com.smarthotel.hotel.hotel.dto.CreateHotelRequest;
import com.smarthotel.hotel.hotel.dto.DeactivateOwnerHotelsResponse;
import com.smarthotel.hotel.hotel.dto.HotelResponse;
import com.smarthotel.hotel.hotel.dto.OwnerHotelPortfolioResponse;
import com.smarthotel.hotel.hotel.dto.UpdateHotelRequest;
import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelApprovalStatus;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import com.smarthotel.hotel.hotel.repository.HotelRepository;
import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.media.repository.HotelImageRepository;
import com.smarthotel.hotel.media.service.MediaStorageService;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import com.smarthotel.hotel.rolechange.fence.OwnerDemotionFenceService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class HotelService {

    private final HotelRepository hotelRepository;
    private final HotelImageRepository hotelImageRepository;
    private final RoomTypeRepository roomTypeRepository;
    private final RoomRepository roomRepository;
    private final MediaStorageService mediaStorageService;
    private final NotificationClient notificationClient;
    private final NominatimGeocodingClient geocodingClient;
    private final OwnerDemotionFenceService ownerDemotionFenceService;

    public HotelService(
            HotelRepository hotelRepository,
            HotelImageRepository hotelImageRepository,
            RoomTypeRepository roomTypeRepository,
            RoomRepository roomRepository,
            MediaStorageService mediaStorageService,
            NotificationClient notificationClient,
            NominatimGeocodingClient geocodingClient,
            OwnerDemotionFenceService ownerDemotionFenceService
    ) {
        this.hotelRepository = hotelRepository;
        this.hotelImageRepository = hotelImageRepository;
        this.roomTypeRepository = roomTypeRepository;
        this.roomRepository = roomRepository;
        this.mediaStorageService = mediaStorageService;
        this.notificationClient = notificationClient;
        this.geocodingClient = geocodingClient;
        this.ownerDemotionFenceService = ownerDemotionFenceService;
    }

    @Transactional
    public HotelResponse create(UUID ownerId, CreateHotelRequest request) {
        String address = normalize(request.address());
        String ward = normalizeNullable(request.ward());
        String district = normalizeNullable(request.district());
        String city = normalize(request.city());

        GeocodingAttempt geocoding = resolveCoordinates(
                address,
                ward,
                district,
                city,
                request.latitude(),
                request.longitude()
        );

        ownerDemotionFenceService.assertLiabilityCreationAllowed(ownerId);

        Hotel hotel = new Hotel(
                ownerId,
                normalize(request.name()),
                normalizeNullable(request.description()),
                address,
                ward,
                district,
                city,
                geocoding.latitude(),
                geocoding.longitude(),
                normalize(request.phone()),
                normalize(request.email()),
                request.starRating(),
                request.checkInTime(),
                request.checkOutTime(),
                normalizeAmenities(request.amenities())
        );

        hotel.applyGeocodingSuccess(
                geocoding.latitude(),
                geocoding.longitude(),
                geocoding.displayName()
        );

        return toResponse(hotelRepository.save(hotel));
    }

    @Transactional(readOnly = true)
    public HotelResponse getPublicById(UUID hotelId) {
        Hotel hotel = hotelRepository
                .findByIdAndStatusAndApprovalStatus(
                        hotelId,
                        HotelStatus.ACTIVE,
                        HotelApprovalStatus.APPROVED
                )
                .orElseThrow(() -> new HotelNotFoundException(hotelId));

        return toResponse(hotel);
    }

    @Transactional(readOnly = true)
    public List<HotelResponse> getPublicHotels(String city) {
        List<Hotel> hotels;

        if (city != null && !city.isBlank()) {
            hotels = hotelRepository
                    .findAllByCityContainingIgnoreCaseAndStatusAndApprovalStatusOrderByCreatedAtDesc(
                            city.trim(),
                            HotelStatus.ACTIVE,
                            HotelApprovalStatus.APPROVED
                    );
        } else {
            hotels = hotelRepository
                    .findAllByStatusAndApprovalStatusOrderByCreatedAtDesc(
                            HotelStatus.ACTIVE,
                            HotelApprovalStatus.APPROVED
                    );
        }

        return hotels.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<HotelResponse> getMine(UUID ownerId) {
        return hotelRepository
                .findAllByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, HotelStatus.ACTIVE)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public OwnerHotelPortfolioResponse getOwnerPortfolio(UUID ownerId) {
        List<Hotel> hotels = hotelRepository.findAllByOwnerIdOrderByCreatedAtDesc(ownerId);
        long activeHotels = hotels.stream()
                .filter(hotel -> hotel.getStatus() == HotelStatus.ACTIVE)
                .count();

        return new OwnerHotelPortfolioResponse(
                hotels.stream().map(Hotel::getId).toList(),
                hotels.size(),
                activeHotels
        );
    }

    @Transactional
    public DeactivateOwnerHotelsResponse deactivateOwnerHotels(UUID ownerId) {
        List<Hotel> hotels = hotelRepository.findAllByOwnerIdOrderByCreatedAtDesc(ownerId);
        long deactivatedHotels = 0;

        for (Hotel hotel : hotels) {
            if (hotel.getStatus() == HotelStatus.ACTIVE) {
                hotel.deactivate();
                deactivatedHotels++;
            }
        }

        return new DeactivateOwnerHotelsResponse(deactivatedHotels);
    }

    @Transactional(readOnly = true)
    public HotelResponse getMineById(UUID ownerId, UUID hotelId) {
        return toResponse(getOwnedHotel(hotelId, ownerId));
    }

    @Transactional(readOnly = true)
    public List<HotelResponse> getPendingHotels() {
        return hotelRepository
                .findAllByApprovalStatusOrderByCreatedAtAsc(
                        HotelApprovalStatus.PENDING
                )
                .stream()
                .filter(hotel -> hotel.getStatus() == HotelStatus.ACTIVE)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public HotelResponse updateOwned(
            UUID ownerId,
            UUID hotelId,
            UpdateHotelRequest request
    ) {
        Hotel hotel = getOwnedHotel(hotelId, ownerId);

        String address = normalize(request.address());
        String ward = normalizeNullable(request.ward());
        String district = normalizeNullable(request.district());
        String city = normalize(request.city());

        boolean locationChanged = !sameText(hotel.getAddress(), address)
                || !sameText(hotel.getWard(), ward)
                || !sameText(hotel.getDistrict(), district)
                || !sameText(hotel.getCity(), city);

        GeocodingAttempt geocoding;
        if (!locationChanged
                && hotel.getLatitude() != null
                && hotel.getLongitude() != null) {
            geocoding = GeocodingAttempt.success(
                    hotel.getLatitude(),
                    hotel.getLongitude(),
                    hotel.getGeocodedAddress()
            );
        } else {
            geocoding = resolveCoordinates(
                    address,
                    ward,
                    district,
                    city,
                    request.latitude(),
                    request.longitude()
            );
        }

        ownerDemotionFenceService.assertLiabilityCreationAllowed(ownerId);

        hotel.update(
                normalize(request.name()),
                normalizeNullable(request.description()),
                address,
                ward,
                district,
                city,
                geocoding.latitude(),
                geocoding.longitude(),
                normalizeNullable(request.phone()),
                normalizeNullable(request.email()),
                request.starRating(),
                request.checkInTime(),
                request.checkOutTime(),
                normalizeAmenities(request.amenities()),
                request.status()
        );

        hotel.applyGeocodingSuccess(
                geocoding.latitude(),
                geocoding.longitude(),
                geocoding.displayName()
        );

        return toResponse(hotel);
    }

    @Transactional
    public HotelResponse submit(UUID ownerId, UUID hotelId) {
        Hotel hotel = getOwnedHotel(hotelId, ownerId);

        ownerDemotionFenceService.assertLiabilityCreationAllowed(ownerId);

        if (hotelImageRepository.countByHotelId(hotelId) == 0) {
            throw new IllegalStateException(
                    "Khách sạn cần ít nhất 1 ảnh trước khi gửi duyệt"
            );
        }

        if (roomTypeRepository.countByHotelId(hotelId) == 0) {
            throw new IllegalStateException(
                    "Khách sạn cần ít nhất 1 loại phòng trước khi gửi duyệt"
            );
        }

        if (roomRepository.countByHotelId(hotelId) == 0) {
            throw new IllegalStateException(
                    "Khách sạn cần ít nhất 1 phòng thực tế trước khi gửi duyệt"
            );
        }

        hotel.submitForApproval();
        notificationClient.sendRole(
                "SYSTEM_ADMIN",
                "Khách sạn mới chờ duyệt",
                "Khách sạn " + hotel.getName() + " vừa được gửi để System Admin kiểm duyệt.",
                "HOTEL_SUBMITTED",
                "HOTEL",
                "/admin/hotels"
        );
        return toResponse(hotel);
    }

    @Transactional
    public void deleteOwned(UUID ownerId, UUID hotelId) {
        Hotel hotel = getOwnedHotel(hotelId, ownerId);
        hotel.deactivate();
    }

    @Transactional
    public HotelResponse approve(UUID hotelId, UUID systemAdminId) {
        Hotel hotel = findHotel(hotelId);
        ownerDemotionFenceService.assertLiabilityCreationAllowed(hotel.getOwnerId());
        hotel.approve(systemAdminId);
        notificationClient.sendUser(
                hotel.getOwnerId(),
                "Khách sạn đã được phê duyệt",
                "Khách sạn " + hotel.getName() + " đã được duyệt và có thể bắt đầu mở bán phòng.",
                "HOTEL_SUBMITTED",
                "HOTEL",
                "/hotel-admin/hotels"
        );
        return toResponse(hotel);
    }

    @Transactional
    public HotelResponse reject(
            UUID hotelId,
            UUID systemAdminId,
            String reason
    ) {
        Hotel hotel = findHotel(hotelId);
        hotel.reject(systemAdminId, normalize(reason));
        notificationClient.sendUser(
                hotel.getOwnerId(),
                "Khách sạn chưa được phê duyệt",
                "Khách sạn " + hotel.getName() + " cần bổ sung thông tin. Lý do: " + normalize(reason),
                "HOTEL_SUBMITTED",
                "HOTEL",
                "/hotel-admin/hotels"
        );
        return toResponse(hotel);
    }

    @Transactional(readOnly = true)
    public Hotel getOwnedHotel(UUID hotelId, UUID ownerId) {
        Hotel hotel = findHotel(hotelId);
        ensureOwner(hotel, ownerId);
        return hotel;
    }

    @Transactional(readOnly = true)
    public Hotel getApprovedOwnedHotel(UUID hotelId, UUID ownerId) {
        Hotel hotel = getOwnedHotel(hotelId, ownerId);

        if (hotel.getStatus() != HotelStatus.ACTIVE) {
            throw new IllegalStateException("Khách sạn đang ngừng hoạt động");
        }

        if (hotel.getApprovalStatus() != HotelApprovalStatus.APPROVED) {
            throw new IllegalStateException(
                    "Khách sạn chưa được System Admin phê duyệt"
            );
        }

        return hotel;
    }

    @Transactional(readOnly = true)
    public Hotel findHotel(UUID hotelId) {
        return hotelRepository
                .findById(hotelId)
                .orElseThrow(() -> new HotelNotFoundException(hotelId));
    }

    private HotelResponse toResponse(Hotel hotel) {
        List<ImageResponse> images = hotelImageRepository
                .findAllByHotelIdOrderBySortOrderAscCreatedAtAsc(hotel.getId())
                .stream()
                .map(image -> ImageResponse.from(
                        image,
                        mediaStorageService.publicUrl(image.getFileName())
                ))
                .toList();

        return HotelResponse.from(
                hotel,
                images,
                roomTypeRepository.countByHotelId(hotel.getId()),
                roomRepository.countByHotelId(hotel.getId())
        );
    }

    private GeocodingAttempt resolveCoordinates(
            String address,
            String ward,
            String district,
            String city,
            Double fallbackLatitude,
            Double fallbackLongitude
    ) {
        GeocodingAttempt attempt = geocodingClient.geocode(
                address,
                ward,
                district,
                city
        );

        if (attempt.successful()) {
            return attempt;
        }

        if (fallbackLatitude != null && fallbackLongitude != null) {
            return GeocodingAttempt.success(
                    fallbackLatitude,
                    fallbackLongitude,
                    null
            );
        }

        if (attempt.status() == GeocodingAttempt.Status.NOT_FOUND) {
            throw new IllegalArgumentException(
                    "OpenStreetMap không xác định được địa chỉ khách sạn. "
                            + "Vui lòng kiểm tra lại số nhà, tên đường, phường/xã, quận/huyện và thành phố."
            );
        }

        if (attempt.status() == GeocodingAttempt.Status.DISABLED) {
            throw new IllegalStateException(
                    "Dịch vụ định vị khách sạn đang bị tắt. Vui lòng bật Nominatim trước khi lưu địa chỉ."
            );
        }

        throw new IllegalStateException(
                "Dịch vụ định vị OpenStreetMap đang tạm thời không phản hồi. Vui lòng thử lại sau."
        );
    }

    private boolean sameText(String left, String right) {
        String normalizedLeft = normalizeNullable(left);
        String normalizedRight = normalizeNullable(right);
        if (normalizedLeft == null) {
            return normalizedRight == null;
        }
        return normalizedLeft.equalsIgnoreCase(normalizedRight);
    }

    private void ensureOwner(Hotel hotel, UUID ownerId) {
        if (!hotel.getOwnerId().equals(ownerId)) {
            throw new AccessDeniedException(
                    "Bạn không có quyền quản lý khách sạn này"
            );
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
