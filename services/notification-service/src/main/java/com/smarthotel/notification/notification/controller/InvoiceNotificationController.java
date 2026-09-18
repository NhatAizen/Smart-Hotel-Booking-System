package com.smarthotel.notification.notification.controller;

import com.smarthotel.notification.notification.dto.CreateNotificationRequest;
import com.smarthotel.notification.notification.dto.NotificationResponse;
import com.smarthotel.notification.notification.service.InvoiceNotificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/notifications/invoices")
public class InvoiceNotificationController {
    private final InvoiceNotificationService service;

    public InvoiceNotificationController(InvoiceNotificationService service) {
        this.service = service;
    }

    @PostMapping("/{deliveryId}")
    public NotificationResponse deliver(@PathVariable UUID deliveryId,
                                        @Valid @RequestBody CreateNotificationRequest request) {
        return service.deliver(deliveryId, request);
    }
}
