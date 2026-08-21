package com.smarthotel.notification.realtime;

import com.smarthotel.notification.notification.dto.NotificationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final String EXCHANGE = "enziurooms.events";

    private final RabbitTemplate rabbitTemplate;

    public RealtimeEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void notificationCreated(NotificationResponse notification) {
        if (notification == null) return;

        Map<String, Object> audience = new LinkedHashMap<>();
        audience.put("broadcast", false);
        audience.put("userIds", notification.userId() == null
                ? List.of()
                : List.of(notification.userId().toString()));
        audience.put("roles", notification.recipientRole() == null
                ? List.of()
                : List.of(normalizeRole(notification.recipientRole())));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", notification.id());
        data.put("userId", notification.userId());
        data.put("recipientRole", notification.recipientRole());
        data.put("title", notification.title());
        data.put("content", notification.content());
        data.put("type", notification.type());
        data.put("category", notification.category());
        data.put("actionUrl", notification.actionUrl());
        data.put("read", notification.read());
        data.put("createdAt", notification.createdAt());

        publish("NOTIFICATION_CREATED", "notification-service", audience, data);
    }

    private void publish(String type, String source, Map<String, Object> audience, Map<String, Object> data) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("type", type);
        event.put("source", source);
        event.put("occurredAt", Instant.now().toString());
        event.put("audience", audience);
        event.put("data", data);
        try {
            rabbitTemplate.convertAndSend(EXCHANGE, "notification.created", event);
        } catch (RuntimeException exception) {
            // Realtime là best-effort: RabbitMQ lỗi không được rollback nghiệp vụ chính.
            log.warn("Không publish được realtime notification {}: {}", notificationId(data), exception.getMessage());
        }
    }

    private Object notificationId(Map<String, Object> data) {
        return data.getOrDefault("id", "unknown");
    }

    private String normalizeRole(String role) {
        return role.trim().replaceFirst("(?i)^ROLE_", "").toUpperCase();
    }
}
