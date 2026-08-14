package com.smarthotel.booking.review.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateReviewRequest(
        @NotNull UUID bookingId,
        @NotNull @Min(1) @Max(10) Integer rating,
        @NotNull @Min(1) @Max(10) Integer staffRating,
        @NotNull @Min(1) @Max(10) Integer facilitiesRating,
        @NotNull @Min(1) @Max(10) Integer cleanlinessRating,
        @NotNull @Min(1) @Max(10) Integer comfortRating,
        @NotNull @Min(1) @Max(10) Integer valueRating,
        @NotNull @Min(1) @Max(10) Integer locationRating,
        @Min(1) @Max(10) Integer wifiRating,
        @Size(max = 180) String title,
        @NotBlank @Size(max = 3000) String positiveComment,
        @Size(max = 3000) String negativeComment
) {
}
