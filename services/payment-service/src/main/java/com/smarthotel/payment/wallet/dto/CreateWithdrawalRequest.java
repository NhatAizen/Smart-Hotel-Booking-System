package com.smarthotel.payment.wallet.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record CreateWithdrawalRequest(
        @NotNull @DecimalMin("10000") BigDecimal amount,
        @NotBlank @Size(max = 120) String bankName,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Mã BIN ngân hàng phải gồm 6 chữ số") String bankBin,
        @NotBlank @Pattern(regexp = "[0-9]{6,30}", message = "Số tài khoản không hợp lệ") String accountNumber,
        @NotBlank @Size(max = 180) String accountName
) {}
