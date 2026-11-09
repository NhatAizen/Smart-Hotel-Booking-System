package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record AssistantHotelCard(
        UUID hotelId,
        String name,
        String city,
        String address,
        Integer starRating,
        String coverImageUrl,
        Double averageRating,
        Long reviewCount,
        UUID roomTypeId,
        String roomTypeName,
        BigDecimal pricePerNight,
        Integer maxAdults,
        Integer maxChildren,
        Integer availableRooms,
        boolean availabilityChecked,
        boolean exactMatch,
        Boolean refundable,
        Boolean breakfastIncluded,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        List<String> amenities,
        List<String> matchReasons,
        Double distanceKm
) {
    public AssistantHotelCard(UUID hotelId,String name,String city,String address,Integer starRating,String coverImageUrl,
            Double averageRating,Long reviewCount,UUID roomTypeId,String roomTypeName,BigDecimal pricePerNight,
            Integer maxAdults,Integer maxChildren,Integer availableRooms,boolean availabilityChecked,boolean exactMatch,
            Boolean refundable,Boolean breakfastIncluded,LocalTime checkInTime,LocalTime checkOutTime,
            List<String> amenities,List<String> matchReasons) {
        this(hotelId,name,city,address,starRating,coverImageUrl,averageRating,reviewCount,roomTypeId,roomTypeName,pricePerNight,
                maxAdults,maxChildren,availableRooms,availabilityChecked,exactMatch,refundable,breakfastIncluded,checkInTime,checkOutTime,amenities,matchReasons,null);
    }
    public AssistantHotelCard withDistance(double distance, String landmark) {
        var reasons=new java.util.ArrayList<String>();
        reasons.add(String.format(java.util.Locale.forLanguageTag("vi-VN"),"Cách %s khoảng %.1f km (đường chim bay)",landmark,distance));
        if(matchReasons!=null) reasons.addAll(matchReasons);
        return new AssistantHotelCard(hotelId,name,city,address,starRating,coverImageUrl,averageRating,reviewCount,roomTypeId,
                roomTypeName,pricePerNight,maxAdults,maxChildren,availableRooms,availabilityChecked,exactMatch,refundable,
                breakfastIncluded,checkInTime,checkOutTime,amenities,List.copyOf(reasons),distance);
    }
}
