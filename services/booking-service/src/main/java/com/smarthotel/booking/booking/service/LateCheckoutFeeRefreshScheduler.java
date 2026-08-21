package com.smarthotel.booking.booking.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class LateCheckoutFeeRefreshScheduler {
    private static final Logger log = LoggerFactory.getLogger(LateCheckoutFeeRefreshScheduler.class);

    private final BookingService bookingService;

    public LateCheckoutFeeRefreshScheduler(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @Scheduled(fixedDelayString = "${pricing.late-checkout.refresh-ms:60000}")
    public void refreshActiveLateCheckoutFees() {
        try {
            int changed = bookingService.refreshActiveLateCheckoutFees();
            if (changed > 0) {
                log.info("Updated late-checkout fee for {} active booking(s)", changed);
            }
        } catch (RuntimeException exception) {
            log.warn("Could not refresh active late-checkout fees: {}", exception.getMessage());
        }
    }
}
