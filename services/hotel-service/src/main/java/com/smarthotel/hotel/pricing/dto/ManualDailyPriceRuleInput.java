package com.smarthotel.hotel.pricing.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ManualDailyPriceRuleInput(
        @NotNull UUID roomTypeId,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2) BigDecimal nightlyPrice
) {}
