package com.smarthotel.identity.partnerrequest.dto;

import com.smarthotel.identity.partnerrequest.ocr.PartnerOcrResult;

import java.time.LocalDate;

public record PartnerOcrPrecheckResponse(
        boolean verified,
        String identityNumber,
        String fullName,
        LocalDate dateOfBirth,
        boolean identityMatched,
        boolean nameMatched,
        boolean dateOfBirthMatched,
        boolean mrzVerified,
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
        String message
) {
    public static PartnerOcrPrecheckResponse from(PartnerOcrResult result) {
        return new PartnerOcrPrecheckResponse(
                result.verified(),
                result.identityNumber(),
                result.fullName(),
                result.dateOfBirth(),
                result.identityMatched(),
                result.nameMatched(),
                result.dateOfBirthMatched(),
                result.mrzVerified(),
                result.mrzFormatValid(),
                result.mrzIdentityNumber(),
                result.mrzFullName(),
                result.mrzDateOfBirth(),
                result.mrzIdentityMatched(),
                result.mrzNameMatched(),
                result.mrzDateOfBirthMatched(),
                result.mrzGender(),
                result.mrzNationality(),
                result.mrzExpiryDate(),
                result.verified()
                        ? "CCCD mặt trước và mặt sau đã được OCR/MRZ và đối chiếu thành công. Bạn có thể tiếp tục xác minh khuôn mặt."
                        : "CCCD chưa vượt qua kiểm tra OCR cả 2 mặt."
        );
    }
}
