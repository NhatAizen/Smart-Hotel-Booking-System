package com.smarthotel.realtime.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class RealtimeWebSocketHandler extends TextWebSocketHandler {

    private final RealtimeSessionRegistry registry;
    private final ObjectMapper objectMapper;

    public RealtimeWebSocketHandler(RealtimeSessionRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        registry.add(session);
        Map<String, Object> connected = new LinkedHashMap<>();
        connected.put("eventId", UUID.randomUUID().toString());
        connected.put("type", "REALTIME_CONNECTED");
        connected.put("source", "realtime-service");
        connected.put("occurredAt", Instant.now().toString());
        connected.put("data", Map.of("connectionId", session.getId()));
        registry.send(session, objectMapper.writeValueAsString(connected));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws JsonProcessingException {
        // Client hiện chỉ cần kênh server-push. Hỗ trợ ping để giữ kết nối trên proxy/mobile network.
        if ("ping".equalsIgnoreCase(message.getPayload().trim())) {
            registry.send(session, objectMapper.writeValueAsString(Map.of(
                    "type", "PONG",
                    "occurredAt", Instant.now().toString()
            )));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        registry.remove(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        registry.remove(session);
        if (session.isOpen()) session.close(CloseStatus.SERVER_ERROR);
    }
}
