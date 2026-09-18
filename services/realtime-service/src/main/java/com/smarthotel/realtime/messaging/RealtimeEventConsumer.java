package com.smarthotel.realtime.messaging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.realtime.websocket.RealtimeSessionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@Component
public class RealtimeEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(RealtimeEventConsumer.class);

    private final RealtimeSessionRegistry registry;
    private final ObjectMapper objectMapper;

    public RealtimeEventConsumer(RealtimeSessionRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    @RabbitListener(queues = "${app.realtime.queue:enziurooms.realtime}")
    public void consume(
            Map<String, Object> event,
            @Header(name = "X-Correlation-ID", required = false) String correlationId
    ) {
        if (correlationId != null && !correlationId.isBlank()) {
            MDC.put("correlationId", correlationId);
        }
        try {
            Map<String, Object> audience = asMap(event.get("audience"));
            boolean broadcast = Boolean.TRUE.equals(audience.get("broadcast"));
            Collection<String> userIds = asStrings(audience.get("userIds"));
            Collection<String> roles = asStrings(audience.get("roles"));

            if (!broadcast && userIds.isEmpty() && roles.isEmpty()) {
                log.debug("Bỏ qua realtime event không có audience: {}", event.get("type"));
                return;
            }

            registry.sendMatching(objectMapper.writeValueAsString(event), broadcast, userIds, roles);
        } catch (JsonProcessingException exception) {
            log.warn("Không serialize được realtime event {}", event.get("type"), exception);
            throw new IllegalStateException("Không serialize được realtime event", exception);
        } finally {
            MDC.remove("correlationId");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private Collection<String> asStrings(Object value) {
        if (!(value instanceof Collection<?> values)) return List.of();
        return values.stream().filter(item -> item != null).map(String::valueOf).toList();
    }
}
