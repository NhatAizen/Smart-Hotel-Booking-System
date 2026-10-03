package com.smarthotel.booking.booking.roomchange.financial;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RoomChangeCreditFeature {
    private final boolean enabled;

    public RoomChangeCreditFeature(
            @Value("${features.room-change-customer-wallet-credit-enabled:false}") boolean enabled
    ) {
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }
}
