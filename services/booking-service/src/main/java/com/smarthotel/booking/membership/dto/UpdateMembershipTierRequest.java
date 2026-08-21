package com.smarthotel.booking.membership.dto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
public record UpdateMembershipTierRequest(@NotNull @Min(0) Integer minCompletedBookings,@NotNull @DecimalMin("0.0") @DecimalMax("30.0") BigDecimal discountPercent,boolean active){}
