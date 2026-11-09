package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.booking.BookingClient;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PlanningAvailabilityTest {
    @Test void anUnavailableOrRejectedPlanCannotBecomeAnUnfilteredSearch() {
        var semantic=mock(LocalSemanticClient.class);var hotels=mock(HotelClient.class);var bookings=mock(BookingClient.class);
        when(semantic.enabled()).thenReturn(true);
        when(semantic.classify(any(AssistantRequest.class))).thenReturn(Optional.empty());
        var service=new GroundedAssistantService(new IntentAnalysisService(semantic),new SystemKnowledgeService(),hotels,bookings);
        var response=service.answer(new AssistantRequest("Tìm khách sạn gần nhà ga T1, dưới một triệu, có hồ bơi",null,null,2,1,null,List.of()),null);
        assertThat(response.intent()).isEqualTo("CLARIFY");
        assertThat(response.answer()).contains("chưa phân tích được đầy đủ");
        assertThat(response.hotels()).isEmpty();assertThat(response.rooms()).isEmpty();assertThat(response.bookings()).isEmpty();
        verifyNoInteractions(hotels,bookings);
    }
    @Test void aReviewedGuideRemainsAvailableWithoutThePlanner() {
        var semantic=mock(LocalSemanticClient.class);var hotels=mock(HotelClient.class);var bookings=mock(BookingClient.class);
        when(semantic.enabled()).thenReturn(true);
        var service=new GroundedAssistantService(new IntentAnalysisService(semantic),new SystemKnowledgeService(),hotels,bookings);
        var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("test").header("alg","HS256").subject(UUID.randomUUID().toString()).build();
        var response=service.answer(new AssistantRequest("Tôi quên mật khẩu thì làm sao?",null,null,null,null,null,List.of()),jwt);
        assertThat(response.intent()).isEqualTo("GENERAL");
        assertThat(response.answer()).doesNotContain("chưa phân tích được đầy đủ");
        verify(semantic,never()).classify(any(AssistantRequest.class));
    }
}
