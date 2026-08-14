package com.smarthotel.payment.wallet.dto;

import jakarta.validation.constraints.Size;

public record ReviewWithdrawalRequest(@Size(max = 500) String note) {}
