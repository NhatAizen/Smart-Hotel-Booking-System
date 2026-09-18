package com.smarthotel.hotel.policy.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;
import java.util.List;

public record UpdateHotelPolicyRequest(
        LocalTime checkInTime,
        LocalTime checkOutTime,
        Boolean lateCheckoutAllowed,
        @Size(max = 1000, message = "Nội dung trả phòng trễ tối đa 1000 ký tự")
        String lateCheckoutDetails,
        @Size(max = 2000, message = "Chính sách trẻ em tối đa 2000 ký tự")
        String childrenPolicy,
        Boolean cribAvailable,
        Boolean extraBedAvailable,
        Boolean petsAllowed,
        Boolean smokingAllowed,
        Boolean partiesAllowed,
        LocalTime quietHoursFrom,
        LocalTime quietHoursTo,
        Boolean identityDocumentRequired,
        @Size(max = 3000, message = "Hướng dẫn nhận phòng tối đa 3000 ký tự")
        String checkInInstructions,
        @Size(max = 20, message = "Tối đa 20 quy định bổ sung")
        List<@Valid HotelPolicyRuleRequest> additionalRules
) {
}
