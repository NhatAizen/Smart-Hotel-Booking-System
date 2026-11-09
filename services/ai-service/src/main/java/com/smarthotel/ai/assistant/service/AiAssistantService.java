package com.smarthotel.ai.assistant.service;

import com.smarthotel.ai.assistant.dto.*;
import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.smarthotel.ai.assistant.v2.dto.IntentAnalysis;
import com.smarthotel.ai.assistant.v2.service.IntentAnalysisService;
import com.smarthotel.ai.assistant.v2.service.SystemKnowledgeService;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.HotelWithRoomTypes;
import com.smarthotel.ai.integration.hotel.dto.RoomTypeResponse;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

/** Compatibility endpoints use the local engine and real hotel data. */
@Service
public class AiAssistantService {
    private final SystemKnowledgeService knowledge;
    private final IntentAnalysisService intents;
    private final HotelClient hotels;

    public AiAssistantService(SystemKnowledgeService knowledge, IntentAnalysisService intents, HotelClient hotels) {
        this.knowledge = knowledge;
        this.intents = intents;
        this.hotels = hotels;
    }

    public AiTextResponse chat(ChatRequest request) {
        return result(knowledge.answer(request.message()));
    }

    public AiTextResponse recommendHotels(HotelRecommendationRequest request) {
        return recommend(request.requirement(), request.hotels().stream().map(HotelCandidate::hotelId).toList());
    }

    public AiTextResponse recommendLiveHotels(LiveHotelRecommendationRequest request) {
        return recommend(request.requirement(), null);
    }

    private AiTextResponse recommend(String requirement, List<UUID> allowedIds) {
        IntentAnalysis criteria = intents.analyze(new AssistantRequest(requirement, null, null, null, null, null, List.of()));
        String rows = hotels.getHotelsWithRoomTypes().stream()
                .filter(item -> allowedIds == null || allowedIds.contains(item.hotel().id()))
                .filter(item -> criteria.city() == null || SystemKnowledgeService.normalize(item.hotel().city())
                        .contains(SystemKnowledgeService.normalize(criteria.city())))
                .map(item -> describe(item, criteria)).filter(row -> !row.isBlank()).limit(3)
                .collect(Collectors.joining("\n"));
        return result(rows.isBlank() ? "Chưa tìm thấy khách sạn phù hợp tiêu chí trong dữ liệu hiện tại."
                : rows + "\nGiá trên là giá cơ bản/phòng/đêm. Chọn ngày ở để kiểm tra phòng trống và giá cuối cùng.");
    }

    private String describe(HotelWithRoomTypes item, IntentAnalysis criteria) {
        RoomTypeResponse room = item.roomTypes().stream()
                .filter(type -> type.status() == null || "ACTIVE".equalsIgnoreCase(type.status()))
                .filter(type -> criteria.adults() == null || type.maxAdults() != null && type.maxAdults() >= criteria.adults())
                .filter(type -> criteria.children() == null || type.maxChildren() != null && type.maxChildren() >= criteria.children())
                .filter(type -> criteria.maxBudgetPerNight() == null || type.basePrice() != null
                        && type.basePrice().compareTo(criteria.maxBudgetPerNight()) <= 0)
                .sorted(Comparator.comparing(RoomTypeResponse::basePrice, Comparator.nullsLast(Comparator.naturalOrder())))
                .findFirst().orElse(null);
        if (room == null) return "";
        return "• %s — %s; %s: %s/phòng/đêm.".formatted(item.hotel().name(), item.hotel().city(), room.name(),
                room.basePrice() == null ? "chưa có giá" : String.format(Locale.forLanguageTag("vi-VN"), "%,.0f ₫", room.basePrice()));
    }

    public AiTextResponse summarizeReviews(ReviewSummaryRequest request) {
        return result("Một số nhận xét được cung cấp (không đại diện cho mọi khách):\n"
                + request.reviews().stream().filter(text -> text != null && !text.isBlank()).limit(3)
                .map(text -> "• “" + (text.length() > 160 ? text.substring(0, 157) + "…" : text.trim()) + "”")
                .collect(Collectors.joining("\n")));
    }

    private AiTextResponse result(String text) {
        return new AiTextResponse(text, SystemKnowledgeService.MODEL, Instant.now());
    }
}
