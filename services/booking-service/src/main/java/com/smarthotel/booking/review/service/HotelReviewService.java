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
import java.time.temporal.ChronoUnit;
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
                    "/hotels/" + hotel.id()
            );
        }
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getByHotel(UUID hotelId) {
        return reviewRepository.findAllByHotelIdOrderByCreatedAtDesc(hotelId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponse> getMyReviews(UUID customerId) {
        return reviewRepository.findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ReviewResponse getByBooking(UUID bookingId) {
        return reviewRepository.findByBookingId(bookingId)
                .map(this::toResponse)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public ReviewSummaryResponse getSummary(UUID hotelId) {
        List<HotelReview> reviews = reviewRepository
                .findAllByHotelIdOrderByCreatedAtDesc(hotelId);

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

    private ReviewResponse toResponse(HotelReview review) {
        IdentityClient.PublicUserProfile publicProfile =
                identityClient.getPublicProfile(review.getCustomerId());

        String currentName = review.getCustomerName();
        String currentAvatarUrl = null;

        if (publicProfile != null) {
            if (
                    publicProfile.fullName() != null
                            && !publicProfile.fullName().isBlank()
            ) {
                currentName = publicProfile.fullName().trim();
            }

            if (
                    publicProfile.avatarUrl() != null
                            && !publicProfile.avatarUrl().isBlank()
            ) {
                currentAvatarUrl = publicProfile.avatarUrl().trim();
            }
        }

        return ReviewResponse.from(
                review,
                currentName,
                currentAvatarUrl
        );
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
