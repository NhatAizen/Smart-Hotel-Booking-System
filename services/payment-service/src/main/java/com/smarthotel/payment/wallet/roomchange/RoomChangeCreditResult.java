package com.smarthotel.payment.wallet.roomchange;

import java.math.BigDecimal;
import java.util.UUID;

public record RoomChangeCreditResult(
        UUID eventId,
        BigDecimal validSettledAmount,
        BigDecimal creditedAmount,
        boolean idempotentReplay
) {}
