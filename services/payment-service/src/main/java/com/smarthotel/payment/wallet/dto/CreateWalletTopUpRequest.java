package com.smarthotel.payment.wallet.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record CreateWalletTopUpRequest(
        @NotNull
        @DecimalMin(value = "2000", message = "Số tiền nạp tối thiểu là 2.000 ₫")
        @DecimalMax(value = "100000000", message = "Mỗi lần chỉ nạp tối đa 100.000.000 ₫")
        BigDecimal amount
) {}
