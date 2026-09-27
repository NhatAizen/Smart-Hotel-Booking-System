package com.smarthotel.hotel.pricing.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CustomerDailyPriceResponse(LocalDate stayDate, BigDecimal nightlyPrice) {}
