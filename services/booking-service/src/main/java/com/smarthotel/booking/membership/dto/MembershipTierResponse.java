package com.smarthotel.booking.membership.dto;
import com.smarthotel.booking.membership.entity.MembershipTier;
import java.math.BigDecimal;
public record MembershipTierResponse(Integer level,String name,Integer minCompletedBookings,BigDecimal discountPercent,boolean active){public static MembershipTierResponse from(MembershipTier t){return new MembershipTierResponse(t.getLevel(),t.getName(),t.getMinCompletedBookings(),t.getDiscountPercent(),t.isActive());}}
