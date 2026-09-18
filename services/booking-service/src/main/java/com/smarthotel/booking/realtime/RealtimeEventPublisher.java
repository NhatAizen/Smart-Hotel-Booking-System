package com.smarthotel.booking.realtime;

import com.smarthotel.booking.booking.realtime.AvailabilityEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class RealtimeEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(RealtimeEventPublisher.class);
    private final RabbitTemplate rabbitTemplate;

    public RealtimeEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void availabilityChanged(AvailabilityEvent availability) {
        if (availability == null || availability.hotelId() == null) return;

        Map<String, Object> audience = new LinkedHashMap<>();
        audience.put("broadcast", true);
        audience.put("userIds", List.of());
        audience.put("roles", List.of());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("change", availability.type());
        data.put("hotelId", availability.hotelId());
        data.put("roomIds", availability.roomIds());
        data.put("checkIn", availability.checkIn());
        data.put("checkOut", availability.checkOut());
        data.put("expiresAt", availability.expiresAt());

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("type", "AVAILABILITY_CHANGED");
        event.put("source", "booking-service");
        event.put("occurredAt", Instant.now().toString());
        event.put("audience", audience);
        event.put("data", data);

        try {
            rabbitTemplate.convertAndSend(
                    "enziurooms.events", "booking.availability.changed", event, correlationHeader());
        } catch (RuntimeException exception) {
            log.warn("Không publish được availability realtime cho hotel {}: {}", availability.hotelId(), exception.getMessage());
        }
    }
    public void promotionChanged(String type, UUID hotelId, String code, boolean broadcast) {
        Map<String, Object> audience = new LinkedHashMap<>();
        audience.put("broadcast", broadcast);
        audience.put("userIds", List.of());
        audience.put("roles", broadcast ? List.of() : List.of("HOTEL_ADMIN"));
        Map<String, Object> data = new LinkedHashMap<>();
        if (hotelId != null) data.put("hotelId", hotelId);
        data.put("code", code == null ? "" : code);
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString()); event.put("type", type);
        event.put("source", "booking-service"); event.put("occurredAt", Instant.now().toString());
        event.put("audience", audience); event.put("data", data);
        try { rabbitTemplate.convertAndSend(
                "enziurooms.events", "promotion.changed", event, correlationHeader()); }
        catch (RuntimeException exception) { log.warn("Không publish được promotion event: {}", exception.getMessage()); }
    }

    private MessagePostProcessor correlationHeader() {
        String correlationId = MDC.get("correlationId");
        return message -> {
            if (correlationId != null && !correlationId.isBlank()) {
                message.getMessageProperties().setHeader("X-Correlation-ID", correlationId);
            }
            return message;
        };
    }

}
