package com.smarthotel.booking.review.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.common.exception.BookingNotFoundException;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.identity.IdentityClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.review.dto.CreateReviewRequest;
import com.smarthotel.booking.review.dto.ReviewResponse;
import com.smarthotel.booking.review.dto.ReviewSummaryResponse;
import com.smarthotel.booking.review.entity.HotelReview;
import com.smarthotel.booking.review.media.ReviewMediaStorageService;
import com.smarthotel.booking.review.repository.HotelReviewRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class HotelReviewService {

    private final HotelReviewRepository reviewRepository;
    private final BookingRepository bookingRepository;
    private final ReviewMediaStorageService mediaStorageService;
    private final IdentityClient identityClient;
    private final HotelClient hotelClient;
    private final NotificationClient notificationClient;

    public HotelReviewService(
            HotelReviewRepository reviewRepository,
            BookingRepository bookingRepository,
            ReviewMediaStorageService mediaStorageService,
            IdentityClient identityClient,
            HotelClient hotelClient,
            NotificationClient notificationClient
    ) {
        this.reviewRepository = reviewRepository;
        this.bookingRepository = bookingRepository;
        this.mediaStorageService = mediaStorageService;
        this.identityClient = identityClient;
        this.hotelClient = hotelClient;
        this.notificationClient = notificationClient;
    }

    @Transactional
    public ReviewResponse create(
            UUID currentCustomerId,
            CreateReviewRequest request,
            List<MultipartFile> images
    ) {
        Booking booking = bookingRepository.findById(request.bookingId())
                .orElseThrow(() -> new BookingNotFoundException(request.bookingId()));

        if (!booking.getCustomerId().equals(currentCustomerId)) {
            throw new IllegalStateException("Bạn không có quyền đánh giá booking này");
        }

        if (booking.getStatus() != BookingStatus.CHECKED_OUT) {
            throw new IllegalStateException("Chỉ được đánh giá sau khi đã trả phòng");
        }

        if (reviewRepository.existsByBookingId(request.bookingId())) {
            throw new IllegalStateException("Booking này đã được đánh giá");
        }

        List<String> imageUrls = mediaStorageService.store(images);

        HotelReview review = new HotelReview(
                booking.getId(),
                booking.getCustomerId(),
                customerName(booking),
                booking.getHotelId(),
                booking.getRoomTypeId(),
                booking.getCheckIn(),
                booking.getCheckOut(),
                booking.getAdults(),
                booking.getChildren(),
                tripType(booking),
                request.rating(),
                request.staffRating(),
                request.facilitiesRating(),
                request.cleanlinessRating(),
                request.comfortRating(),
                request.valueRating(),
                request.locationRating(),
                request.wifiRating(),
                normalizeNullable(request.title()),
                request.positiveComment().trim(),
                normalizeNullable(request.negativeComment()),
                imageUrls
        );

        HotelReview saved = reviewRepository.save(review);
        HotelClient.HotelDetails hotel = hotelClient.getHotel(booking.getHotelId());
        if (hotel.ownerId() != null) {
            notificationClient.sendUser(
                    hotel.ownerId(),
                    "Có đánh giá mới",
                    "Khách vừa đánh giá " + request.rating() + "/10 cho " + hotel.name() + ".",
                    "REVIEW_CREATED",
                    "REVIEW",
                    "/hotel-admin/reviews"
            );
        }
        return toResponse(saved, hotel.name());
    }

    /** Public: chỉ trả review đang hiển thị. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> getByHotel(UUID hotelId) {
        String hotelName = safeHotelName(hotelId);
        return reviewRepository
                .findAllByHotelIdAndModerationStatusOrderByCreatedAtDesc(
                        hotelId,
                        HotelReview.MODERATION_VISIBLE
                )
                .stream()
                .map(review -> toResponse(review, hotelName))
                .toList();
    }

    /** Customer vẫn thấy review của chính mình kể cả khi System Admin đã ẩn khỏi public. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> getMyReviews(UUID customerId) {
        Map<UUID, String> hotelNames = new LinkedHashMap<>();
        return reviewRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .map(review -> toResponse(review, cachedHotelName(hotelNames, review.getHotelId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ReviewResponse getByBooking(UUID bookingId) {
        return reviewRepository.findByBookingId(bookingId)
                .map(review -> toResponse(review, safeHotelName(review.getHotelId())))
                .orElse(null);
    }

    /** Hotel Admin: chỉ thấy review thuộc các khách sạn do chính tài khoản đó quản lý. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> getHotelAdminReviews(UUID hotelAdminId, String bearerToken) {
        Map<UUID, String> ownedHotels = ownedHotelNames(hotelAdminId, bearerToken);
        if (ownedHotels.isEmpty()) {
            return List.of();
        }

        return reviewRepository.findAllByHotelIdInOrderByCreatedAtDesc(ownedHotels.keySet())
                .stream()
                .map(review -> toResponse(review, ownedHotels.get(review.getHotelId())))
                .toList();
    }

    @Transactional
    public ReviewResponse createHotelReply(
            UUID hotelAdminId,
            String bearerToken,
            UUID reviewId,
            String content
    ) {
        HotelReview review = requireOwnedReview(hotelAdminId, bearerToken, reviewId);
        ensureReplyAllowed(review);
        review.createHotelReply(hotelAdminId, normalizeReply(content));
        HotelReview saved = reviewRepository.save(review);

        String hotelName = ownedHotelNames(hotelAdminId, bearerToken)
                .getOrDefault(saved.getHotelId(), "Khách sạn");

        notificationClient.sendUser(
                saved.getCustomerId(),
                hotelName + " đã phản hồi đánh giá",
                "Khách sạn đã phản hồi đánh giá " + saved.getRating()
                        + "/10 của bạn. Bấm để xem phản hồi.",
                "REVIEW_REPLIED",
                "REVIEW",
                "/customer/reviews"
        );

        return toResponse(saved, hotelName);
    }

    @Transactional
    public ReviewResponse updateHotelReply(
            UUID hotelAdminId,
            String bearerToken,
            UUID reviewId,
            String content
    ) {
        HotelReview review = requireOwnedReview(hotelAdminId, bearerToken, reviewId);
        ensureReplyAllowed(review);
        review.updateHotelReply(hotelAdminId, normalizeReply(content));
        HotelReview saved = reviewRepository.save(review);
        return toResponse(saved, ownedHotelNames(hotelAdminId, bearerToken).get(saved.getHotelId()));
    }

    @Transactional
    public ReviewResponse deleteHotelReply(
            UUID hotelAdminId,
            String bearerToken,
            UUID reviewId
    ) {
        HotelReview review = requireOwnedReview(hotelAdminId, bearerToken, reviewId);
        ensureReplyAllowed(review);
        review.deleteHotelReply();
        HotelReview saved = reviewRepository.save(review);
        return toResponse(saved, ownedHotelNames(hotelAdminId, bearerToken).get(saved.getHotelId()));
    }

    /** System Admin: xem cả VISIBLE và HIDDEN để kiểm duyệt/khôi phục. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> getAllForSystemAdmin() {
        Map<UUID, String> hotelNames = new LinkedHashMap<>();
        return reviewRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(review -> toResponse(review, cachedHotelName(hotelNames, review.getHotelId())))
                .toList();
    }

    @Transactional
    public ReviewResponse hideReview(UUID systemAdminId, UUID reviewId, String reason) {
        HotelReview review = requireReview(reviewId);
        String normalizedReason = normalizeReason(reason);
        review.hide(systemAdminId, normalizedReason);
        HotelReview saved = reviewRepository.save(review);
        return toResponse(saved, safeHotelName(saved.getHotelId()));
    }

    @Transactional
    public ReviewResponse restoreReview(UUID reviewId) {
        HotelReview review = requireReview(reviewId);
        review.restore();
        HotelReview saved = reviewRepository.save(review);
        return toResponse(saved, safeHotelName(saved.getHotelId()));
    }

    /** Summary public phải loại toàn bộ review đã bị moderation ẩn. */
    @Transactional(readOnly = true)
    public ReviewSummaryResponse getSummary(UUID hotelId) {
        List<HotelReview> reviews = reviewRepository
                .findAllByHotelIdAndModerationStatusOrderByCreatedAtDesc(
                        hotelId,
                        HotelReview.MODERATION_VISIBLE
                );

        Map<Integer, Long> distribution = new LinkedHashMap<>();
        for (int rating = 10; rating >= 1; rating--) {
            distribution.put(rating, 0L);
        }

        for (HotelReview review : reviews) {
            distribution.computeIfPresent(
                    review.getRating(),
                    (key, count) -> count + 1
            );
        }

        Double average = average(
                reviews.stream().map(HotelReview::getRating).toList()
        );

        Map<String, Double> categories = new LinkedHashMap<>();
        categories.put("staff", average(reviews.stream().map(HotelReview::getStaffRating).toList()));
        categories.put("facilities", average(reviews.stream().map(HotelReview::getFacilitiesRating).toList()));
        categories.put("cleanliness", average(reviews.stream().map(HotelReview::getCleanlinessRating).toList()));
        categories.put("comfort", average(reviews.stream().map(HotelReview::getComfortRating).toList()));
        categories.put("value", average(reviews.stream().map(HotelReview::getValueRating).toList()));
        categories.put("location", average(reviews.stream().map(HotelReview::getLocationRating).toList()));
        categories.put("wifi", average(reviews.stream()
                .map(HotelReview::getWifiRating)
                .filter(value -> value != null)
                .toList()));

        return new ReviewSummaryResponse(
                hotelId,
                reviews.size(),
                average,
                distribution,
                categories
        );
    }

    private HotelReview requireOwnedReview(UUID hotelAdminId, String bearerToken, UUID reviewId) {
        HotelReview review = requireReview(reviewId);
        Map<UUID, String> ownedHotels = ownedHotelNames(hotelAdminId, bearerToken);
        if (!ownedHotels.containsKey(review.getHotelId())) {
            throw new IllegalStateException("Bạn không có quyền quản lý đánh giá của khách sạn này");
        }
        return review;
    }

    private HotelReview requireReview(UUID reviewId) {
        return reviewRepository.findById(reviewId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy đánh giá: " + reviewId));
    }

    private Map<UUID, String> ownedHotelNames(UUID hotelAdminId, String bearerToken) {
        Map<UUID, String> result = new LinkedHashMap<>();
        for (HotelClient.OwnedHotelDetails hotel : hotelClient.getMyHotels(bearerToken)) {
            if (hotel.id() == null) {
                continue;
            }
            // /api/hotels/mine đã kiểm tra ownership; so sánh thêm ownerId để phòng thủ.
            if (hotel.ownerId() == null || hotel.ownerId().equals(hotelAdminId)) {
                result.put(hotel.id(), hotel.name());
            }
        }
        return result;
    }

    private void ensureReplyAllowed(HotelReview review) {
        if (review.isHidden()) {
            throw new IllegalStateException("Không thể phản hồi đánh giá đang bị System Admin ẩn");
        }
    }

    private String normalizeReply(String content) {
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("Nội dung phản hồi không được để trống");
        }
        String normalized = content.trim();
        if (normalized.length() > 1500) {
            throw new IllegalArgumentException("Phản hồi tối đa 1500 ký tự");
        }
        return normalized;
    }

    private String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Vui lòng nhập lý do ẩn đánh giá");
        }
        String normalized = reason.trim();
        if (normalized.length() > 500) {
            throw new IllegalArgumentException("Lý do ẩn tối đa 500 ký tự");
        }
        return normalized;
    }

    private ReviewResponse toResponse(HotelReview review, String hotelName) {
        IdentityClient.PublicUserProfile publicProfile =
                identityClient.getPublicProfile(review.getCustomerId());

        String currentName = review.getCustomerName();
        String currentAvatarUrl = null;

        if (publicProfile != null) {
            if (publicProfile.fullName() != null && !publicProfile.fullName().isBlank()) {
                currentName = publicProfile.fullName().trim();
            }
            if (publicProfile.avatarUrl() != null && !publicProfile.avatarUrl().isBlank()) {
                currentAvatarUrl = publicProfile.avatarUrl().trim();
            }
        }

        return ReviewResponse.from(
                review,
                currentName,
                currentAvatarUrl,
                hotelName
        );
    }

    private String cachedHotelName(Map<UUID, String> cache, UUID hotelId) {
        if (cache.containsKey(hotelId)) {
            return cache.get(hotelId);
        }
        String name = safeHotelName(hotelId);
        cache.put(hotelId, name);
        return name;
    }

    private String safeHotelName(UUID hotelId) {
        try {
            HotelClient.HotelDetails hotel = hotelClient.getHotel(hotelId);
            return hotel.name();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private Double average(List<Integer> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        double raw = values.stream().mapToInt(Integer::intValue).average().orElse(0);
        return BigDecimal.valueOf(raw)
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private String customerName(Booking booking) {
        String first = normalizeNullable(booking.getBookerFirstName());
        String last = normalizeNullable(booking.getBookerLastName());
        String full = String.join(" ",
                first == null ? "" : first,
                last == null ? "" : last
        ).trim();
        return full.isBlank() ? "Khách hàng EnziuRooms" : full;
    }

    private String tripType(Booking booking) {
        int adults = booking.getAdults() == null ? 1 : booking.getAdults();
        int children = booking.getChildren() == null ? 0 : booking.getChildren();

        if (children > 0) return "FAMILY";
        if (adults <= 1) return "SOLO";
        if (adults == 2) return "COUPLE";
        return "GROUP";
    }

    private String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
