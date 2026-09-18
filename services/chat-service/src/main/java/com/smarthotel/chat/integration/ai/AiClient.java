package com.smarthotel.chat.integration.ai;

import com.smarthotel.chat.observability.CorrelationIdRestClientCustomizer;

import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.integration.hotel.HotelClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

@Component
public class AiClient {

    private final RestClient restClient;

    public AiClient(@Value("${clients.ai.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
                .requestInterceptor(CorrelationIdRestClientCustomizer.interceptor())
                .baseUrl(baseUrl).build();
    }

    public AiReply reply(
            String bearerToken,
            String customerMessage,
            ChatConversation conversation,
            BookingClient.BookingSnapshot booking,
            HotelClient.HotelSnapshot hotel,
            List<HotelClient.RoomTypeSnapshot> roomTypes
    ) {
        if (bearerToken == null || bearerToken.isBlank()) {
            return null;
        }

        String prompt = buildPrompt(customerMessage, conversation, booking, hotel, roomTypes);

        try {
            AiTextResponse response = restClient.post()
                    .uri("/api/ai/chat")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                    .body(new ChatRequest(prompt))
                    .retrieve()
                    .body(AiTextResponse.class);

            if (response == null || response.result() == null || response.result().isBlank()) {
                return null;
            }

            String answer = response.result().trim();
            boolean escalate = answer.startsWith("[[ESCALATE]]");
            if (escalate) {
                answer = answer.replaceFirst("^\\[\\[ESCALATE\\]\\]\\s*", "").trim();
            }
            return new AiReply(answer, escalate);
        } catch (Exception exception) {
            return null;
        }
    }

    private String buildPrompt(
            String customerMessage,
            ChatConversation conversation,
            BookingClient.BookingSnapshot booking,
            HotelClient.HotelSnapshot hotel,
            List<HotelClient.RoomTypeSnapshot> roomTypes
    ) {
        String roomCatalog = roomTypes == null || roomTypes.isEmpty()
                ? "chưa có dữ liệu loại phòng"
                : roomTypes.stream()
                .map(this::roomTypeLine)
                .toList()
                .toString();

        String bookingFacts;
        if (booking == null) {
            bookingFacts = """
                    Booking: khách chưa có booking được gắn vào cuộc chat này
                    Ngày ở: chưa có
                    Loại phòng đã đặt: chưa có
                    Khách: chưa có dữ liệu booking
                    Tổng tiền: chưa có
                    Đã trả: chưa có
                    Còn lại: chưa có
                    Trạng thái xác nhận đến: chưa áp dụng
                    Giờ dự kiến đến trễ: chưa áp dụng
                    """;
        } else {
            HotelClient.RoomTypeSnapshot bookedRoom = roomTypes == null
                    ? null
                    : roomTypes.stream()
                    .filter(item -> item != null && item.id() != null && item.id().equals(booking.roomTypeId()))
                    .findFirst()
                    .orElse(null);

            String refundable = bookedRoom == null || bookedRoom.refundable() == null
                    ? "không xác định"
                    : (Boolean.TRUE.equals(bookedRoom.refundable()) ? "có" : "không");

            bookingFacts = """
                    Booking: %s
                    Trạng thái booking: %s
                    Ngày ở: %s → %s
                    Loại phòng đã đặt: %s
                    Khách: %s người lớn, %s trẻ em
                    Tổng tiền: %s
                    Đã trả: %s
                    Còn lại: %s
                    Hoàn tiền theo loại phòng: %s
                    Yêu cầu đặc biệt: %s
                    Trạng thái xác nhận đến: %s
                    Giờ dự kiến đến trễ: %s
                    """.formatted(
                    safe(booking.bookingCode()),
                    safe(booking.status()),
                    booking.checkIn(),
                    booking.checkOut(),
                    bookedRoom == null ? "không xác định" : safe(bookedRoom.name()),
                    booking.adults(),
                    booking.children(),
                    booking.totalPrice(),
                    booking.paidAmount(),
                    booking.remainingAmount(),
                    refundable,
                    safe(booking.specialRequest()),
                    conversation.getArrivalStatus(),
                    conversation.getExpectedArrivalTime()
            );
        }

        return """
                Bạn là trợ lý tự động của chính khách sạn trong hộp chat Customer ↔ Hotel của EnziuRooms.
                Hãy hiểu ngữ nghĩa tiếng Việt tự nhiên, kể cả câu rút gọn, viết sai chính tả và câu hỏi tiếp nối.

                MỤC TIÊU:
                - Trả lời như trợ lý của khách sạn, nhanh và đúng trọng tâm.
                - Nếu chưa có booking, vẫn được trả lời thông tin chung của khách sạn và loại phòng dựa trên FACTS.
                - Nếu đã có booking, ưu tiên thông tin booking cụ thể của khách.

                NGUYÊN TẮC:
                - Chỉ dùng FACTS bên dưới. Không bịa giá, giờ, chính sách, booking, tiện nghi hoặc tình trạng phòng.
                - Không nói "backend", "API", "database", "Gemini".
                - Không tự phê duyệt hoàn tiền, đổi phòng miễn phí, late checkout, thêm khách vượt sức chứa,
                  khiếu nại, bồi thường/hư hỏng hoặc ngoại lệ chính sách.
                - Nếu câu hỏi cần Hotel Admin quyết định, bắt đầu câu trả lời bằng đúng marker [[ESCALATE]]
                  rồi nói ngắn gọn rằng yêu cầu đã được chuyển cho khách sạn.
                - Nếu FACTS không đủ để khẳng định, cũng dùng [[ESCALATE]] thay vì đoán.
                - Với câu hỏi "còn phòng không" mà chưa có ngày nhận/trả, hãy hỏi khách chọn ngày ở; không bịa số phòng trống.
                - Với câu hỏi về giá, chỉ nêu giá niêm yết từ danh sách loại phòng nếu có. Giá theo ngày/ưu đãi cần ngày ở cụ thể.
                - Trả lời tối đa 4-5 câu hoặc danh sách ngắn, không viết lan man.

                FACTS KHÁCH SẠN:
                Tên: %s
                Địa chỉ: %s, %s
                Điện thoại: %s
                Email: %s
                Hạng sao: %s
                Check-in mặc định: %s
                Check-out mặc định: %s
                Tiện nghi khách sạn: %s
                Các loại phòng: %s

                FACTS BOOKING:
                %s

                CUSTOMER:
                %s
                """.formatted(
                safe(hotel.name()),
                safe(hotel.address()),
                safe(hotel.city()),
                safe(hotel.phone()),
                safe(hotel.email()),
                hotel.starRating(),
                hotel.checkInTime(),
                hotel.checkOutTime(),
                hotel.amenities(),
                roomCatalog,
                bookingFacts,
                customerMessage == null ? "" : customerMessage.trim()
        );
    }

    private String roomTypeLine(HotelClient.RoomTypeSnapshot roomType) {
        if (roomType == null) return "-";
        return "%s | giá niêm yết %s | tối đa %s người lớn + %s trẻ em | %s %s | %s m² | bữa sáng=%s | hoàn tiền=%s"
                .formatted(
                        safe(roomType.name()),
                        roomType.basePrice(),
                        roomType.maxAdults(),
                        roomType.maxChildren(),
                        roomType.bedCount(),
                        safe(roomType.bedType()),
                        roomType.areaSqm(),
                        roomType.breakfastIncluded(),
                        roomType.refundable()
                );
    }

    private String safe(Object value) {
        return value == null ? "không có" : String.valueOf(value);
    }

    private record ChatRequest(String message) {
    }

    private record AiTextResponse(String result, String model, String generatedAt) {
    }

    public record AiReply(String answer, boolean escalate) {
    }
}
