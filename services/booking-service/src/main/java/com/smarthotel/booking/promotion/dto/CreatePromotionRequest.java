package com.smarthotel.booking.promotion.dto;
import com.smarthotel.booking.promotion.entity.DiscountType;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
public record CreatePromotionRequest(
 @NotBlank @Size(max=40) String code,@NotBlank @Size(max=160) String name,@Size(max=600) String description,
 UUID hotelId,@NotNull DiscountType discountType,@NotNull @DecimalMin("0.01") BigDecimal discountValue,
 @DecimalMin("0.0") BigDecimal maxDiscount,@DecimalMin("0.0") BigDecimal minBookingAmount,
 @NotNull Instant startAt,@NotNull Instant endAt,@Min(1) Integer usageLimit,@Min(1) Integer usagePerUser){}
