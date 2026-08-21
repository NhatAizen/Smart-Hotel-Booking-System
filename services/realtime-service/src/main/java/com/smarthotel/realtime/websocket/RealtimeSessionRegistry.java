package com.smarthotel.realtime.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RealtimeSessionRegistry {

    private final Map<String, ClientSession> sessions = new ConcurrentHashMap<>();

    public void add(WebSocketSession session) {
        String userId = value(session, "userId");
        String role = value(session, "role");
        if (role == null) role = "GUEST";
        sessions.put(session.getId(), new ClientSession(session, userId, role));
    }

    public void remove(WebSocketSession session) {
        sessions.remove(session.getId());
    }

    public int size() {
        return sessions.size();
    }

    public void sendMatching(String payload, boolean broadcast, Collection<String> userIds, Collection<String> roles) {
        Set<String> users = userIds == null ? Set.of() : Set.copyOf(userIds);
        Set<String> normalizedRoles = roles == null
                ? Set.of()
                : roles.stream().filter(value -> value != null && !value.isBlank())
                .map(value -> value.replaceFirst("(?i)^ROLE_", "").toUpperCase())
                .collect(java.util.stream.Collectors.toSet());

        for (ClientSession client : new ArrayList<>(sessions.values())) {
            boolean matches = broadcast
                    || (client.userId() != null && users.contains(client.userId()))
                    || normalizedRoles.contains(client.role());
            if (!matches) continue;
            send(client.session(), payload);
        }
    }

    public void send(WebSocketSession session, String payload) {
        if (session == null || !session.isOpen()) return;
        try {
            synchronized (session) {
                if (session.isOpen()) session.sendMessage(new TextMessage(payload));
            }
        } catch (IOException exception) {
            remove(session);
        }
    }

    private String value(WebSocketSession session, String key) {
        Object value = session.getAttributes().get(key);
        return value == null ? null : String.valueOf(value);
    }

    private record ClientSession(WebSocketSession session, String userId, String role) {}
}
