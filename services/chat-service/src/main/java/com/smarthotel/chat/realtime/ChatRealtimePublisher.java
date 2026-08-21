package com.smarthotel.chat.realtime;

import com.smarthotel.chat.message.dto.ChatMessageResponse;
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
public class ChatRealtimePublisher {

    private static final Logger log = LoggerFactory.getLogger(ChatRealtimePublisher.class);
    private static final String EXCHANGE = "enziurooms.events";

    private final RabbitTemplate rabbitTemplate;

    public ChatRealtimePublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void messageCreated(
            ChatMessageResponse message,
            UUID customerId,
            UUID hotelAdminId
    ) {
        if (message == null) return;

        Map<String, Object> audience = new LinkedHashMap<>();
        audience.put("broadcast", false);
        audience.put(
                "userIds",
                List.of(customerId, hotelAdminId)
                        .stream()
                        .filter(id -> id != null)
                        .map(UUID::toString)
                        .toList()
        );
        audience.put("roles", List.of());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("conversationId", message.conversationId());
        data.put("message", message);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("type", "CHAT_MESSAGE_CREATED");
        event.put("source", "chat-service");
        event.put("occurredAt", Instant.now().toString());
        event.put("audience", audience);
        event.put("data", data);

        try {
            rabbitTemplate.convertAndSend(EXCHANGE, "chat.message.created", event);
        } catch (RuntimeException exception) {
            log.warn("Không publish được realtime chat: {}", exception.getMessage());
        }
    }
}
