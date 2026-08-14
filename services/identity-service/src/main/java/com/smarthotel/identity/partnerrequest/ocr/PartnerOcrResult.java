package com.smarthotel.identity.partnerrequest.ocr;

import java.time.LocalDate;

public record PartnerOcrResult(
        String identityNumber,
        String fullName,
        LocalDate dateOfBirth,
        boolean identityMatched,
        boolean nameMatched,
        boolean dateOfBirthMatched,
        boolean mrzFormatValid,
        String mrzIdentityNumber,
        String mrzFullName,
        LocalDate mrzDateOfBirth,
        boolean mrzIdentityMatched,
        boolean mrzNameMatched,
        boolean mrzDateOfBirthMatched,
        String mrzGender,
        String mrzNationality,
        LocalDate mrzExpiryDate,
        boolean mrzVerified,
        boolean verified
) {
}
