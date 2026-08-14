package com.smarthotel.hotel.hotel.dto;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.hotel.entity.HotelApprovalStatus;
import com.smarthotel.hotel.hotel.entity.HotelStatus;
import com.smarthotel.hotel.media.dto.ImageResponse;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record HotelResponse(
        UUID id,
        UUID ownerId,
        String name,
        String description,
        String address,
        String ward,
        String district,
        String city,
        Double latitude,
        Double longitude,
        String phone,
        String email,
        Integer starRating,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        Set<String> amenities,
        String coverImageUrl,
        List<ImageResponse> images,
        long roomTypeCount,
        long roomCount,
        HotelStatus status,
        HotelApprovalStatus approvalStatus,
        String rejectionReason,
        UUID reviewedBy,
        Instant reviewedAt,
        Instant createdAt,
        Instant updatedAt
) {
    public static HotelResponse from(
            Hotel hotel,
            List<ImageResponse> images,
            long roomTypeCount,
            long roomCount
    ) {
        String coverImageUrl = images.stream()
                .filter(ImageResponse::cover)
                .map(ImageResponse::url)
                .findFirst()
                .orElseGet(() -> images.stream()
                        .map(ImageResponse::url)
                        .findFirst()
                        .orElse(null));

        return new HotelResponse(
                hotel.getId(),
                hotel.getOwnerId(),
                hotel.getName(),
                hotel.getDescription(),
                hotel.getAddress(),
                hotel.getWard(),
                hotel.getDistrict(),
                hotel.getCity(),
                hotel.getLatitude(),
                hotel.getLongitude(),
                hotel.getPhone(),
                hotel.getEmail(),
                hotel.getStarRating(),
                hotel.getCheckInTime(),
                hotel.getCheckOutTime(),
                Set.copyOf(hotel.getAmenities()),
                coverImageUrl,
                images,
                roomTypeCount,
                roomCount,
                hotel.getStatus(),
                hotel.getApprovalStatus(),
                hotel.getRejectionReason(),
                hotel.getReviewedBy(),
                hotel.getReviewedAt(),
                hotel.getCreatedAt(),
                hotel.getUpdatedAt()
        );
    }
}
