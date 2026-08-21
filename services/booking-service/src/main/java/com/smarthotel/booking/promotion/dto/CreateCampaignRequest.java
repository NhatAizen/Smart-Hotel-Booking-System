package com.smarthotel.booking.promotion.dto;
import jakarta.validation.constraints.*;import java.time.Instant;import java.util.UUID;
public record CreateCampaignRequest(@NotBlank @Size(max=160) String name,@NotBlank @Size(max=220) String title,@Size(max=800) String description,@Size(max=80) String badgeText,UUID promotionId,@NotNull Instant startAt,@NotNull Instant endAt){}
