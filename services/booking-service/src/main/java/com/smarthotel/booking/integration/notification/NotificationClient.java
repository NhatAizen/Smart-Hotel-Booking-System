package com.smarthotel.booking.integration.notification;

import com.smarthotel.booking.observability.CorrelationIdRestClientCustomizer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.JdkClientHttpRequestFactory;

@Component
public class NotificationClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationClient.class);
    private final RestClient restClient;
    private final RestClient invoiceRestClient;

    public NotificationClient(
            @Value("${clients.notification.base-url}") String baseUrl,
            @Value("${clients.notification.api-key}") String apiKey
    ) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(baseUrl)
                .defaultHeader("X-Internal-Api-Key", apiKey)
                .build();
        var requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(40));
        this.invoiceRestClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(baseUrl)
                .defaultHeader("X-Internal-Api-Key", apiKey)
                .requestFactory(requestFactory)
                .build();
    }

    public void sendUser(UUID userId, String title, String content, String type, String category, String actionUrl) {
        send(new Payload(userId, null, null, title, content, type, category, actionUrl, false));
    }

    public void sendRole(String role, String title, String content, String type, String category, String actionUrl) {
        send(new Payload(null, role, null, title, content, type, category, actionUrl, false));
    }

    public void sendInvoice(UUID deliveryId, UUID userId, String email, String title, String content,
                            String actionUrl) {
        // Propagate delivery failures so the pending invoice remains eligible for retry.
        invoiceRestClient.post().uri("/api/notifications/invoices/{id}", deliveryId)
                .body(new Payload(userId, null, email, title, content, "SYSTEM", "INVOICE", actionUrl, true))
                .retrieve().toBodilessEntity();
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
