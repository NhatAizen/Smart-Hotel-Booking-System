package com.smarthotel.booking.booking.roomchange;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record RoomChangeRequestResponse(
        UUID id,
        UUID bookingId,
        UUID customerId,
        UUID hotelId,
        UUID originalRoomId,
        UUID originalRoomTypeId,
        UUID targetRoomId,
        UUID targetRoomTypeId,
        String reason,
        RoomChangeRequestStatus status,
        String reviewNote,
        BigDecimal oldTotalPrice,
        BigDecimal newTotalPrice,
        BigDecimal priceDifference,
        BigDecimal additionalPaymentDue,
        Instant requestedAt,
        Instant reviewedAt,
        UUID reviewedBy
) {
    public static RoomChangeRequestResponse from(RoomChangeRequest request) {
        return new RoomChangeRequestResponse(
                request.getId(),
                request.getBookingId(),
                request.getCustomerId(),
                request.getHotelId(),
                request.getOriginalRoomId(),
                request.getOriginalRoomTypeId(),
                request.getTargetRoomId(),
                request.getTargetRoomTypeId(),
                request.getReason(),
                request.getStatus(),
                request.getReviewNote(),
                request.getOldTotalPrice(),
                request.getNewTotalPrice(),
                request.getPriceDifference(),
                request.getAdditionalPaymentDue(),
                request.getRequestedAt(),
                request.getReviewedAt(),
                request.getReviewedBy()
        );
    }
}
