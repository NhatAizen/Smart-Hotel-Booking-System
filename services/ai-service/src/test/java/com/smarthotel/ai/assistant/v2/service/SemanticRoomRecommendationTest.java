package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.*;
import com.smarthotel.ai.integration.booking.BookingClient;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.argThat;

class SemanticRoomRecommendationTest {
    private final LocalSemanticClient semantic = mock(LocalSemanticClient.class);
    private final IntentAnalysisService intents = new IntentAnalysisService(semantic);
    private final UUID hotelId = UUID.randomUUID();
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private SemanticDecision decision(String intent, String preference) {
        return new SemanticDecision(intent, null, preference, .94, .08, "Xenova/multilingual-e5-small", "pinned-revision");
    }

    @Test
    void semanticMeaningChoosesRoomWorkflowForUnseenPhrasing() {
        String question = "Chọn cho mình căn nào ở cho thoải mái với";
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(decision("ROOM_RECOMMEND", "BALANCED")));
        var understanding = intents.understand(new AssistantRequest(question, null, null, 2, 1, hotelId, List.of()));
        assertThat(understanding.analysis().intent()).isEqualTo("ROOM_RECOMMEND");
        assertThat(understanding.analysis().city()).isNull();
    }

    @Test
    void hotelReferenceCannotBecomeAFakeDestination() {
        String question = "tôi hỏi bạn phòng nào được nhất trong các phòng ở khách sạn đó";
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(decision("ROOM_RECOMMEND", "BALANCED")));
        assertThat(intents.understand(new AssistantRequest(question, null, null, 2, 1, hotelId, List.of())).analysis().city()).isNull();
    }

    @Test
    void explicitNewHotelSearchDoesNotStayStuckOnThePreviousHotel() {
        String question = "Tìm giúp tôi khách sạn ở Nha Trang";
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(decision("ROOM_RECOMMEND", "BALANCED")));
        assertThat(intents.understand(new AssistantRequest(question, null, null, 2, 1, hotelId, List.of())).analysis().intent()).isEqualTo("RECOMMEND_HOTELS");
    }

    @Test
    void refusesExternalInferenceConfiguration() {
        assertThatThrownBy(() -> new LocalSemanticClient(true, "https://example.com"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void bestAndCheapestUseOnlyActualRoomFactsAndLocalSemanticProvenance() throws Exception {
        HotelClient hotels = mock(HotelClient.class);
        BookingClient bookings = mock(BookingClient.class);
        HotelResponse hotel = json.readValue("{\"id\":\"" + hotelId + "\",\"name\":\"Lotus\",\"status\":\"ACTIVE\"}", HotelResponse.class);
        RoomTypeResponse cheap = json.readValue("""
                {"id":"%s","name":"Standard","basePrice":600000,"maxAdults":2,"maxChildren":1,"areaSqm":20,"status":"ACTIVE"}
                """.formatted(UUID.randomUUID()), RoomTypeResponse.class);
        RoomTypeResponse large = json.readValue("""
                {"id":"%s","name":"Family Suite","basePrice":1200000,"maxAdults":2,"maxChildren":2,"areaSqm":45,"breakfastIncluded":true,"refundable":true,"status":"ACTIVE"}
                """.formatted(UUID.randomUUID()), RoomTypeResponse.class);
        when(hotels.getHotel(hotelId)).thenReturn(hotel);
        when(hotels.getRoomTypes(hotelId)).thenReturn(List.of(cheap, large));
        when(semantic.classify(argThat(r -> r != null && "Bạn xem phòng nào được nhất".equals(r.message())))).thenReturn(Optional.of(decision("ROOM_RECOMMEND", "BALANCED")));
        when(semantic.classify(argThat(r -> r != null && "Có loại nào tiết kiệm hơn không".equals(r.message())))).thenReturn(Optional.of(decision("ROOM_RECOMMEND", "CHEAPEST")));
        GroundedAssistantService service = new GroundedAssistantService(intents, new SystemKnowledgeService(), hotels, bookings);
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "HS256").subject(UUID.randomUUID().toString()).build();
        AssistantResponse best = service.answer(new AssistantRequest("Bạn xem phòng nào được nhất", null, null, 2, 1, hotelId, List.of()), jwt);
        assertThat(best.rooms().get(0).name()).isEqualTo("Family Suite");
        assertThat(best.answer()).contains("Lotus", "Family Suite", "2 người lớn và 1 trẻ em", "1.200.000");
        assertThat(best.engine().semanticUnderstandingUsed()).isTrue();
        assertThat(best.engine().externalModelUsed()).isFalse();
        AssistantResponse cheapest = service.answer(new AssistantRequest("Có loại nào tiết kiệm hơn không", null, null, 2, 1, hotelId, List.of()), jwt);
        assertThat(cheapest.rooms().get(0).name()).isEqualTo("Standard");
        verifyNoInteractions(bookings);
    }
}
