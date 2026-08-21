package com.smarthotel.booking.promotion.dto;
import java.math.BigDecimal;import java.util.UUID;
public record DiscountPreviewResponse(UUID customerId,UUID hotelId,Integer membershipLevel,String membershipName,BigDecimal membershipPercent,BigDecimal subtotal,BigDecimal membershipDiscount,String hotelPromotionCode,BigDecimal hotelPromotionDiscount,String platformPromotionCode,BigDecimal platformPromotionDiscount,BigDecimal totalDiscount,BigDecimal finalAmount,BigDecimal discountCap){}
