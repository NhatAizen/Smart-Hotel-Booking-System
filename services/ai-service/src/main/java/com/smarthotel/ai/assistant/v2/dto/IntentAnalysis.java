package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record IntentAnalysis(
        String intent,
        String city,
        BigDecimal maxBudgetPerNight,
        Integer starRating,
        Integer adults,
        Integer children,
        LocalDate checkIn,
        LocalDate checkOut,
        List<String> amenities,
        List<String> hotelNames,
        String bookingCode,
        AssistantRoomCriteria roomCriteria,
        NearbyLocation nearby
) {
    public IntentAnalysis(String intent, String city, BigDecimal maxBudgetPerNight, Integer starRating,
            Integer adults, Integer children, LocalDate checkIn, LocalDate checkOut, List<String> amenities,
            List<String> hotelNames, String bookingCode, AssistantRoomCriteria roomCriteria) {
        this(intent,city,maxBudgetPerNight,starRating,adults,children,checkIn,checkOut,amenities,hotelNames,bookingCode,roomCriteria,null);
    }
    public IntentAnalysis withNearby(NearbyLocation value) {
        return new IntentAnalysis(intent,city,maxBudgetPerNight,starRating,adults,children,checkIn,checkOut,amenities,hotelNames,bookingCode,roomCriteria,value);
    }
    public IntentAnalysis withCity(String value) {
        return new IntentAnalysis(intent,value,maxBudgetPerNight,starRating,adults,children,checkIn,checkOut,amenities,hotelNames,bookingCode,roomCriteria,nearby);
    }
    public IntentAnalysis(String intent, String city, BigDecimal maxBudgetPerNight, Integer starRating,
                          Integer adults, Integer children, LocalDate checkIn, LocalDate checkOut,
                          List<String> amenities, List<String> hotelNames, String bookingCode) {
        this(intent,city,maxBudgetPerNight,starRating,adults,children,checkIn,checkOut,amenities,hotelNames,bookingCode,null);
    }
}
