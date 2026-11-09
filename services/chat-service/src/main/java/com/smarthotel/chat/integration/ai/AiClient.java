package com.smarthotel.chat.integration.ai;

import com.smarthotel.chat.conversation.entity.ChatConversation;
import com.smarthotel.chat.integration.booking.BookingClient;
import com.smarthotel.chat.integration.hotel.HotelClient;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/** Local hotel replies use only the conversation facts already loaded by ChatService. */
@Component
public class AiClient {
    public AiReply reply(String bearerToken, String customerMessage, ChatConversation conversation,
                         BookingClient.BookingSnapshot booking, HotelClient.HotelSnapshot hotel,
                         List<HotelClient.RoomTypeSnapshot> roomTypes) {
        if (hotel == null || bearerToken == null || bearerToken.isBlank()) return null;
        String question = Normalizer.normalize(customerMessage == null ? "" : customerMessage, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").replace('đ', 'd').toLowerCase(Locale.ROOT);
        // Requests for exceptions and decisions always reach hotel staff.
        if (question.matches(".*\\b(hoan tien|huy|doi phong|khieu nai|boi thuong|hu hong|mien phi|som|tre|muon|late)\\b.*")) {
            return escalate();
        }
        if (question.matches(".*(nhan phong|check.?in|qr).*")) {
            if (hotel.checkInTime() == null) return escalate();
            return new AiReply(hotel.name() + " nhận phòng từ " + hotel.checkInTime()
                    + (booking == null ? "" : " ngày " + booking.checkIn())
                    + ". Xuất trình QR đơn và giấy tờ theo yêu cầu; khách sạn xác minh, kiểm tra thanh toán và xác nhận nhận phòng.", false);
        }
        if (question.matches(".*(tra phong|check.?out).*")) {
            if (hotel.checkOutTime() == null) return escalate();
            return new AiReply(hotel.name() + " trả phòng trước " + hotel.checkOutTime()
                    + (booking == null ? "" : " ngày " + booking.checkOut()) + ".", false);
        }
        if (question.matches(".*(dia chi|o dau).*")) {
            if (hotel.address() == null) return escalate();
            return new AiReply(hotel.name() + ": " + hotel.address() + ", " + hotel.city() + ".", false);
        }
        if (question.matches(".*(thanh toan|da tra|con lai|con phai tra).*")) {
            if (booking == null) return escalate();
            return new AiReply("Đơn " + booking.bookingCode() + ": đã trả " + money(booking.paidAmount())
                    + "; còn lại " + money(booking.remainingAmount()) + ".", false);
        }
        if (question.matches(".*(con phong|phong trong).*")) {
            return new AiReply("Chọn ngày nhận/trả và số khách trên trang khách sạn để kiểm tra phòng trống chính xác.", false);
        }
        if (question.matches(".*(gia phong|loai phong|phong nao).*")) {
            if (roomTypes == null || roomTypes.isEmpty()) return escalate();
            String rows = roomTypes.stream().filter(room -> room != null && room.basePrice() != null).limit(3)
                    .map(room -> room.name() + ": " + money(room.basePrice()) + "/phòng/đêm")
                    .collect(Collectors.joining("; "));
            if (rows.isBlank()) return escalate();
            return new AiReply(rows + ". Đây là giá cơ bản; chọn ngày ở để xem giá cuối cùng và phòng trống.", false);
        }
        if (question.matches(".*(tien nghi|wifi|ho boi|bua sang).*")) {
            if (hotel.amenities() == null || hotel.amenities().isEmpty()) return escalate();
            return new AiReply("Tiện nghi khách sạn đã công bố: " + String.join(", ", hotel.amenities())
                    + ". Tiện nghi từng loại phòng cần xem trong chi tiết phòng.", false);
        }
        return escalate();
    }

    private AiReply escalate() {
        return new AiReply("Yêu cầu này cần khách sạn xác nhận. Tôi đã chuyển để nhân viên hỗ trợ bạn.", true);
    }

    private String money(BigDecimal amount) {
        return amount == null ? "chưa có dữ liệu" : String.format(Locale.forLanguageTag("vi-VN"), "%,.0f ₫", amount);
    }

    public record AiReply(String answer, boolean escalate) {}
}
