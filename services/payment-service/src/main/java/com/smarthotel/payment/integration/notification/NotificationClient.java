package com.smarthotel.payment.integration.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Component
public class NotificationClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationClient.class);
    private final RestClient restClient;

    public NotificationClient(
            @Value("${clients.notification.base-url}") String baseUrl,
            @Value("${clients.notification.api-key}") String apiKey
    ) {
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("X-Internal-Api-Key", apiKey)
                .build();
    }

    public void sendUser(UUID userId, String title, String content, String type, String category, String actionUrl) {
        send(new Payload(userId, null, null, title, content, type, category, actionUrl, false));
    }

    public void sendRole(String role, String title, String content, String type, String category, String actionUrl) {
        send(new Payload(null, role, null, title, content, type, category, actionUrl, false));
    }

    private void send(Payload payload) {
        try {
            restClient.post().uri("/api/notifications").body(payload).retrieve().toBodilessEntity();
        } catch (Exception exception) {
            LOGGER.warn("Notification service unavailable: {}", exception.getMessage());
        }
    }

    private record Payload(UUID userId, String recipientRole, String email, String title, String content,
                           String type, String category, String actionUrl, boolean sendEmail) {}
}
