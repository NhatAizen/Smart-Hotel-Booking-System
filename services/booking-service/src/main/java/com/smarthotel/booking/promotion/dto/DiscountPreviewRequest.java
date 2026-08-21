package com.smarthotel.booking.promotion.dto;
import jakarta.validation.constraints.*;import java.math.BigDecimal;import java.util.UUID;
public record DiscountPreviewRequest(@NotNull UUID hotelId,@NotNull @DecimalMin("0.0") BigDecimal amount,@Size(max=40) String hotelPromotionCode,@Size(max=40) String platformPromotionCode){}
