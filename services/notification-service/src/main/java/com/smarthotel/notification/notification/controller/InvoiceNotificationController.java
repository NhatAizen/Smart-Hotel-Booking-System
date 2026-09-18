package com.smarthotel.notification.notification.controller;

import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.service.InvoiceNotificationService;
import com.smarthotel.notification.security.InternalApiKeyVerifier;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/notifications/invoices")
public class InvoiceNotificationController {
    private final InvoiceNotificationService service;
    private final InternalApiKeyVerifier internalApiKeyVerifier;

    public InvoiceNotificationController(
            InvoiceNotificationService service,
            InternalApiKeyVerifier internalApiKeyVerifier
    ) {
        this.service = service;
        this.internalApiKeyVerifier = internalApiKeyVerifier;
    }

    @PostMapping("/{deliveryId}")
    public NotificationResponse deliver(@PathVariable UUID deliveryId,
                                        @RequestHeader(value = "X-Internal-Api-Key", required = false)
                                        String internalApiKey,
                                        @Valid @RequestBody CreateNotificationRequest request) {
        internalApiKeyVerifier.verify(internalApiKey);
        return service.deliver(deliveryId, request);
    }
}
