package com.smarthotel.booking.membership.dto;
import java.math.BigDecimal;
public record MembershipProfileResponse(Integer level,String name,long completedBookings,BigDecimal discountPercent,Integer nextLevel,String nextName,Integer bookingsToNextLevel){}
