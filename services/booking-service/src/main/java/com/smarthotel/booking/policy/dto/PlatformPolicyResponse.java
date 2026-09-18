package com.smarthotel.booking.policy.dto;

import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.policy.entity.PlatformPolicySettings;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public record PlatformPolicyResponse(
        Integer minimumBookingAge,
        Integer minimumCheckInAge,
        List<String> supportedPaymentOptions,
        List<String> refundRequestEligibleBookingStatuses,
        String reviewEligibleBookingStatus,
        String qrIdentityVerificationMethod,
        UUID updatedBy,
        Instant updatedAt
) {
    public static PlatformPolicyResponse from(PlatformPolicySettings settings) {
        return new PlatformPolicyResponse(
                settings.getMinimumBookingAge(),
                settings.getMinimumBookingAge(),
                Arrays.stream(PaymentOption.values()).map(Enum::name).toList(),
                List.of(BookingStatus.CANCELLED.name(), BookingStatus.NO_SHOW.name()),
                BookingStatus.CHECKED_OUT.name(),
                "QR_CCCD",
                settings.getUpdatedBy(),
                settings.getUpdatedAt()
        );
    }
}
