package com.smarthotel.hotel.policy.dto;

import com.smarthotel.hotel.hotel.entity.Hotel;
import com.smarthotel.hotel.policy.entity.HotelPolicy;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record HotelPolicyResponse(
        UUID hotelId,
        LocalTime checkInTime,
        LocalTime checkOutTime,
        Boolean lateCheckoutAllowed,
        String lateCheckoutDetails,
        String childrenPolicy,
        Boolean cribAvailable,
        Boolean extraBedAvailable,
        Boolean petsAllowed,
        Boolean smokingAllowed,
        Boolean partiesAllowed,
        LocalTime quietHoursFrom,
        LocalTime quietHoursTo,
        Boolean identityDocumentRequired,
        String checkInInstructions,
        List<AdditionalRuleResponse> additionalRules,
        boolean configured,
        Instant updatedAt
) {
    public static HotelPolicyResponse empty(Hotel hotel) {
        return new HotelPolicyResponse(
                hotel.getId(), hotel.getCheckInTime(), hotel.getCheckOutTime(),
                null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(), false, null
        );
    }

    public static HotelPolicyResponse from(Hotel hotel, HotelPolicy policy) {
        return new HotelPolicyResponse(
                hotel.getId(), hotel.getCheckInTime(), hotel.getCheckOutTime(),
                policy.getLateCheckoutAllowed(), policy.getLateCheckoutDetails(),
                policy.getChildrenPolicy(), policy.getCribAvailable(),
                policy.getExtraBedAvailable(), policy.getPetsAllowed(),
                policy.getSmokingAllowed(), policy.getPartiesAllowed(),
                policy.getQuietHoursFrom(), policy.getQuietHoursTo(),
                policy.getIdentityDocumentRequired(), policy.getCheckInInstructions(),
                policy.getAdditionalRules().stream()
                        .map(rule -> new AdditionalRuleResponse(
                                rule.getId(), rule.getTitle(), rule.getContent(), rule.getSortOrder()
                        ))
                        .toList(),
                true,
                policy.getUpdatedAt()
        );
    }

    public record AdditionalRuleResponse(
            UUID id,
            String title,
            String content,
            Integer sortOrder
    ) {
    }
}
