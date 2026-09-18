package com.smarthotel.hotel.integration.notification;

import com.smarthotel.hotel.observability.CorrelationIdRestClientCustomizer;

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
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
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

    public void sendRoomApproved(UUID hotelAdminId, String roomNumber, String hotelName) {
        sendUser(hotelAdminId, "Phòng đã được duyệt",
                "Phòng " + roomNumber + " của khách sạn " + hotelName + " đã được duyệt.",
                "SYSTEM", "HOTEL", "/hotel-admin/rooms");
    }

    public void sendRoomRejected(UUID hotelAdminId, String roomNumber, String hotelName, String reason) {
        sendUser(hotelAdminId, "Phòng bị từ chối",
                "Phòng " + roomNumber + " của khách sạn " + hotelName + " đã bị từ chối. Lý do: " + reason,
                "SYSTEM", "HOTEL", "/hotel-admin/rooms");
    }

    public void sendRoomCleaningRequired(UUID hotelAdminId, String roomNumber, String hotelName) {
        sendUser(hotelAdminId, "Phòng cần vệ sinh",
                "Phòng " + roomNumber + " của khách sạn " + hotelName
                        + " vừa trả khách và đang chờ vệ sinh. Hãy xác nhận Đã dọn xong khi phòng sẵn sàng.",
                "ROOM_CLEANING", "HOUSEKEEPING", "/hotel-admin/rooms?status=CLEANING");
    }

    public void sendRoomReady(UUID hotelAdminId, String roomNumber, String hotelName) {
        sendUser(hotelAdminId, "Phòng đã sẵn sàng",
                "Phòng " + roomNumber + " của khách sạn " + hotelName
                        + " đã vệ sinh xong và được chuyển sang trạng thái Còn trống.",
                "ROOM_READY", "HOUSEKEEPING", "/hotel-admin/rooms");
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
