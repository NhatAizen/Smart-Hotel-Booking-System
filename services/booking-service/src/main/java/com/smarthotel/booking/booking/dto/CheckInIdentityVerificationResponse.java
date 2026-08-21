package com.smarthotel.booking.booking.dto;

import java.time.Instant;
import java.time.LocalDate;

public record CheckInIdentityVerificationResponse(
        String status,
        String subjectType,
        String subjectName,
        LocalDate expectedDateOfBirth,
        Boolean nameMatched,
        Boolean dateOfBirthMatched,
        Boolean ageEligible,
        Integer ageAtCheckIn,
        String identityNumberLast4,
        Instant verifiedAt,
        String failureReason,
        String method
) {
}
