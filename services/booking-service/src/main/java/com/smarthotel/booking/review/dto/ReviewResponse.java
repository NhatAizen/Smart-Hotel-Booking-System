package com.smarthotel.booking.review.dto;

import com.smarthotel.booking.review.entity.HotelReview;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ReviewResponse(
        UUID id,
        UUID bookingId,
        UUID customerId,
        String customerName,
        String customerAvatarUrl,
        UUID hotelId,
        String hotelName,
        UUID roomTypeId,
        LocalDate checkIn,
        LocalDate checkOut,
        Integer adults,
        Integer children,
        String tripType,
        String language,
        Integer rating,
        Integer staffRating,
        Integer facilitiesRating,
        Integer cleanlinessRating,
        Integer comfortRating,
        Integer valueRating,
        Integer locationRating,
        Integer wifiRating,
        String title,
        String positiveComment,
        String negativeComment,
        List<String> images,
        String hotelReply,
        Instant hotelReplyAt,
        UUID hotelReplyBy,
        String moderationStatus,
        String hiddenReason,
        Instant hiddenAt,
        UUID hiddenBy,
        Instant createdAt,
        Instant updatedAt
) {
    public static ReviewResponse from(HotelReview review) {
        return from(review, review.getCustomerName(), null, null);
    }

    public static ReviewResponse from(
            HotelReview review,
            String currentCustomerName,
            String currentCustomerAvatarUrl,
            String hotelName
    ) {
        return new ReviewResponse(
                review.getId(),
                review.getBookingId(),
                review.getCustomerId(),
                currentCustomerName,
                currentCustomerAvatarUrl,
                review.getHotelId(),
                hotelName,
                review.getRoomTypeId(),
                review.getCheckIn(),
                review.getCheckOut(),
                review.getAdults(),
                review.getChildren(),
                review.getTripType(),
                review.getReviewLanguage(),
                review.getRating(),
                review.getStaffRating(),
                review.getFacilitiesRating(),
                review.getCleanlinessRating(),
                review.getComfortRating(),
                review.getValueRating(),
                review.getLocationRating(),
                review.getWifiRating(),
                review.getTitle(),
                review.getPositiveComment(),
                review.getNegativeComment(),
                List.copyOf(review.getImageUrls()),
                review.getHotelReply(),
                review.getHotelReplyAt(),
                review.getHotelReplyBy(),
                review.getModerationStatus(),
                review.getHiddenReason(),
                review.getHiddenAt(),
                review.getHiddenBy(),
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }
}
