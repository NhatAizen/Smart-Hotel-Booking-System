package com.smarthotel.chat.integration.ai;

import com.smarthotel.chat.integration.hotel.HotelClient;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class LocalHotelReplyTest {
    private final AiClient client = new AiClient();
    private final HotelClient.HotelSnapshot hotel = new HotelClient.HotelSnapshot(
            UUID.randomUUID(), UUID.randomUUID(), "Lotus", null, "12 Đường Biển", null, null,
            "Đà Nẵng", null, null, 4, LocalTime.of(14, 0), LocalTime.NOON, Set.of("WiFi"));

    @Test
    void availabilityQuestionWithoutDatesAsksForDates() {
        AiClient.AiReply reply = reply("Còn phòng không?");
        assertFalse(reply.escalate());
        assertTrue(reply.answer().contains("ngày nhận/trả"));
    }

    @Test
    void specialRequestsAndUnknownQuestionsReachHotelStaff() {
        assertTrue(reply("Cho tôi trả phòng muộn miễn phí").escalate());
        assertTrue(reply("Tôi muốn hoàn tiền").escalate());
        assertTrue(reply("Khách sạn cho nuôi mèo không?").escalate());
    }

    @Test
    void checkInAnswersUseHotelFactsWithoutAnAiProvider() {
        AiClient.AiReply reply = reply("nhan phong luc nao");
        assertFalse(reply.escalate());
        assertTrue(reply.answer().contains("14:00"));
        assertTrue(reply.answer().contains("xác minh"));
    }

    private AiClient.AiReply reply(String question) {
        return client.reply("customer-token", question, null, null, hotel, List.of());
    }
}
