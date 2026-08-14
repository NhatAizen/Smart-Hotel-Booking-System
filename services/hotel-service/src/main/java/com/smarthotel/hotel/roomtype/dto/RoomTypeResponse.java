package com.smarthotel.hotel.roomtype.dto;

import com.smarthotel.hotel.media.dto.ImageResponse;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.entity.RoomTypeStatus;
import com.smarthotel.hotel.roomtype.entity.RoomTypeApprovalStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public record RoomTypeResponse(
        UUID id,
        UUID hotelId,
        String name,
        String description,
        BigDecimal basePrice,
        Integer maxAdults,
        Integer maxChildren,
        String bedType,
        Integer bedCount,
        BigDecimal areaSqm,
        boolean breakfastIncluded,
        boolean refundable,
        boolean smokingAllowed,
        boolean payAtHotelAllowed,
        boolean depositAllowed,
        Integer depositPercent,
        boolean fullPaymentAllowed,
        Set<String> amenities,
        String coverImageUrl,
        List<ImageResponse> images,
        long roomCount,
        long availableRoomCount,
        RoomTypeStatus status,
        RoomTypeApprovalStatus approvalStatus,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        UUID reviewedBy,
        Instant createdAt,
        Instant updatedAt
) {
    public static RoomTypeResponse from(
            RoomType roomType,
            List<ImageResponse> images,
            long roomCount,
            long availableRoomCount
    ) {
        String coverImageUrl = images.stream()
                .filter(ImageResponse::cover)
                .map(ImageResponse::url)
                .findFirst()
                .orElseGet(() -> images.stream()
                        .map(ImageResponse::url)
                        .findFirst()
                        .orElse(null));

        return new RoomTypeResponse(
                roomType.getId(),
                roomType.getHotelId(),
                roomType.getName(),
                roomType.getDescription(),
                roomType.getBasePrice(),
                roomType.getMaxAdults(),
                roomType.getMaxChildren(),
                roomType.getBedType(),
                roomType.getBedCount(),
                roomType.getAreaSqm(),
                roomType.isBreakfastIncluded(),
                roomType.isRefundable(),
                roomType.isSmokingAllowed(),
                roomType.isPayAtHotelAllowed(),
                roomType.isDepositAllowed(),
                roomType.getDepositPercent(),
                roomType.isFullPaymentAllowed(),
                Set.copyOf(roomType.getAmenities()),
                coverImageUrl,
                images,
                roomCount,
                availableRoomCount,
                roomType.getStatus(),
                roomType.getApprovalStatus(),
                roomType.getRejectionReason(),
                roomType.getSubmittedAt(),
                roomType.getReviewedAt(),
                roomType.getReviewedBy(),
                roomType.getCreatedAt(),
                roomType.getUpdatedAt()
        );
    }
}
