package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.integration.booking.dto.AvailabilityResponse;
import com.smarthotel.ai.integration.booking.dto.ReviewSummaryResponse;
import com.smarthotel.ai.integration.booking.dto.BookingResponse;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import java.util.List;
import java.util.Set;
import com.smarthotel.ai.integration.hotel.dto.RoomResponse;
import org.springframework.web.client.RestClientException;

/** Successful HTTP transport is insufficient: evidence must belong to this query. */
final class GroundedData {
    private GroundedData() {}
    static AvailabilityResponse availability(UUID hotel, LocalDate start, LocalDate end, AvailabilityResponse result) {
        if (result == null || !Objects.equals(hotel,result.hotelId()) || !Objects.equals(start,result.checkIn())
                || !Objects.equals(end,result.checkOut()) || result.unavailableRoomIds() == null
                || result.unavailableRoomIds().stream().anyMatch(Objects::isNull))
            throw new RestClientException("Availability evidence does not match the query");
        return result;
    }
    static ReviewSummaryResponse reviews(UUID hotel, ReviewSummaryResponse result) {
        if (result == null || !Objects.equals(hotel,result.hotelId()) || result.reviewCount() < 0
                || result.averageRating() != null && (!Double.isFinite(result.averageRating())
                || result.averageRating() < 0 || result.averageRating() > 10 || result.reviewCount() == 0))
            throw new RestClientException("Review evidence does not match the hotel");
        return result;
    }
    static List<RoomResponse> inventory(UUID hotel, List<RoomResponse> rooms) {
        if (rooms == null || rooms.stream().anyMatch(room -> room == null || !Objects.equals(hotel,room.hotelId())
                || room.id() == null || room.status() == null
                || !Set.of("AVAILABLE","OCCUPIED","CLEANING","MAINTENANCE","INACTIVE").contains(room.status().toUpperCase(java.util.Locale.ROOT))))
            throw new RestClientException("Room inventory evidence does not match the hotel");
        return rooms;
    }
    static List<BookingResponse> customerBookings(UUID customer, List<BookingResponse> rows) {
        if (rows == null || rows.stream().anyMatch(row -> row == null || !Objects.equals(customer,row.customerId())))
            throw new RestClientException("Booking evidence does not belong to the authenticated customer");
        return rows;
    }
}
