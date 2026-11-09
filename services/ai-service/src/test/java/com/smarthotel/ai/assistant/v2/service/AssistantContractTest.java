package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.booking.BookingClient;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class AssistantContractTest {
    @ParameterizedTest
    @CsvSource(delimiter='|', value={
        "GENERAL|MORE_HOTELS", "MY_BOOKINGS|NEW_SEARCH", "REVIEW_SUMMARY|MORE_ROOMS",
        "COMPARE_HOTELS|MORE_HOTELS", "ROOM_COMPARE|SELECT_OPTION", "HOTEL_DETAILS|REFINE_SEARCH",
        "RECOMMEND_HOTELS|MORE_ROOMS", "ROOM_RECOMMEND|MORE_HOTELS", "CLARIFY|RECHECK_TRIP",
        "DELETE_BOOKING|NONE", "GENERAL|EXECUTE_SQL"
    })
    void invalidPlansAskForClarificationBeforeReadingOrExecutingAnything(String intent,String action) {
        var planner=mock(IntentAnalysisService.class);
        var hotels=mock(HotelClient.class);
        var bookings=mock(BookingClient.class);
        var request=new AssistantRequest("arbitrary user text",null,null,null,null,null,List.of());
        var analysis=new IntentAnalysis(intent,null,null,null,null,null,null,null,List.of(),List.of(),null);
        when(planner.understand(request)).thenReturn(new IntentAnalysisService.Understanding(analysis,null,action));
        var answer=new GroundedAssistantService(planner,new SystemKnowledgeService(),hotels,bookings).answer(request,null);
        assertThat(answer.answer()).contains("chưa xác định").hasSizeLessThan(220);
        assertThat(answer.hotels()).isEmpty();
        assertThat(answer.bookings()).isEmpty();
        assertThat(answer.rooms()).isEmpty();
        assertThat(answer.conversationAction()).isEqualTo("NONE");
        verifyNoInteractions(hotels,bookings);
    }
}
