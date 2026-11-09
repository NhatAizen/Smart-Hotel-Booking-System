package com.smarthotel.ai.integration.hotel.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record HotelResponse(
        UUID id,
        UUID ownerId,
        String name,
        String description,
        String address,
        String ward,
        String district,
        String city,
        String phone,
        String email,
        Integer starRating,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        Set<String> amenities,
        String coverImageUrl,
        Long roomTypeCount,
        Long roomCount,
        String status,
        String approvalStatus,
        Double latitude,
        Double longitude
) {
    public HotelResponse(UUID id, UUID ownerId, String name, String description, String address, String ward,
            String district, String city, String phone, String email, Integer starRating, LocalTime checkInTime,
            LocalTime checkOutTime, Set<String> amenities, String coverImageUrl, Long roomTypeCount, Long roomCount,
            String status, String approvalStatus) {
        this(id,ownerId,name,description,address,ward,district,city,phone,email,starRating,checkInTime,checkOutTime,
                amenities,coverImageUrl,roomTypeCount,roomCount,status,approvalStatus,null,null);
    }
}
