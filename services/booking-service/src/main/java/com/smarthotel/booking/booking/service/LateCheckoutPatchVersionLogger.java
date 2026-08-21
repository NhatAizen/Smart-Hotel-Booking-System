package com.smarthotel.booking.booking.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LateCheckoutPatchVersionLogger {
    private static final Logger log = LoggerFactory.getLogger(LateCheckoutPatchVersionLogger.class);

    @PostConstruct
    public void logVersion() {
        log.info("ENZIUROOMS_LATE_FEE_PATCH_V2_ACTIVE - dynamic late fee financial reconciliation enabled");
    }
}
