package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.booking.BookingClient;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.security.oauth2.jwt.Jwt;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DialoguePolicyTest {
    @Test void clarificationAsksForThePendingFieldOnlyWhileTheLocationIsUnresolved() {
        var query=NearbyLocation.requested("nhà ga T3",3.);
        var analysis=new IntentAnalysis("CLARIFY",null,null,null,2,1,null,null,List.of(),List.of(),null).withNearby(query);
        var search=new AssistantQueryContext("Hồ Chí Minh",null,null,null,null,2,1,List.of(),false,null,query);
        var state=new AssistantConversationContext(List.of(),List.of(),search,"RECOMMEND_HOTELS",List.of(),null,null,List.of(),List.of());
        var request=new AssistantRequest("không biết",null,null,2,1,null,List.of(),state);
        assertThat(DialoguePolicy.pendingLandmark(request)).isTrue();
        assertThat(DialoguePolicy.clarification(request,analysis,"NONE")).contains("tên đầy đủ của địa điểm");
        var found=new NearbyLocation("T3",3.,"T3 Tân Sơn Nhất",10.8122002,106.654338,"https://www.openstreetmap.org/way/1240951104");
        var resolved=new AssistantQueryContext("Hồ Chí Minh",null,null,null,null,2,1,List.of(),true,null,found);
        var resolvedState=new AssistantConversationContext(List.of(),List.of(),resolved,"RECOMMEND_HOTELS",List.of(),null,null,List.of(),List.of());
        var next=new AssistantRequest("hả",null,null,2,1,null,List.of(),resolvedState);
        assertThat(DialoguePolicy.pendingLandmark(next)).isFalse();
        assertThat(DialoguePolicy.clarification(next,analysis,"NONE")).doesNotContain("tên đầy đủ của địa điểm");
        var legacyCity=new NearbyLocation("Sài Gòn",5.,"Sai Gon",10.77,106.68,"https://www.openstreetmap.org/node/10591979655");
        var invalidPoint=new AssistantQueryContext("Hồ Chí Minh",null,null,null,null,2,1,List.of(),true,null,legacyCity);
        var legacyState=new AssistantConversationContext(List.of(),List.of(),invalidPoint,"RECOMMEND_HOTELS");
        assertThat(DialoguePolicy.pendingLandmark(new AssistantRequest("Nhà ga T1",null,null,2,1,null,List.of(),legacyState))).isTrue();
    }
    private final LocalSemanticClient semantic = mock(LocalSemanticClient.class);
    private final IntentAnalysisService intents = new IntentAnalysisService(semantic);
    private final HotelClient hotels = mock(HotelClient.class);
    private final BookingClient bookings = mock(BookingClient.class);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final UUID hotel = UUID.randomUUID();
    private final Jwt jwt = Jwt.withTokenValue("test").header("alg","HS256").subject(UUID.randomUUID().toString()).build();
    private final LocalDate date = LocalDate.now().plusDays(10);
    private final AssistantQueryContext search = new AssistantQueryContext("Hồ Chí Minh",new BigDecimal("900000"),4,date,date.plusDays(2),2,1,List.of("WiFi","Hồ bơi"),false);

    @Test void reviewedProceduresAvoidUnnecessaryModelInference() {
        var reply=intents.understand(request("Tôi quên mật khẩu thì làm sao?",memory()));
        assertThat(reply.analysis().intent()).isEqualTo("GENERAL");
        assertThat(reply.action()).isEqualTo("NONE");
        verifyNoInteractions(semantic);
    }

    private void classify(String question, String intent, String action) {
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(new SemanticDecision(intent,null,"BALANCED",.95,.08,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned",action)));
    }
    private AssistantRequest request(String question, AssistantConversationContext memory) {
        return new AssistantRequest(question,date,date.plusDays(2),2,1,hotel,List.of(),memory);
    }
    private AssistantConversationContext memory() {
        return new AssistantConversationContext(List.of(),List.of(),search,"RECOMMEND_HOTELS");
    }

    @ParameterizedTest
    @CsvSource(delimiter='|', value={
        "Không cần hồ bơi nữa|WiFi|Hồ bơi",
        "Bỏ yêu cầu có hồ bơi đi|WiFi|Hồ bơi",
        "Gỡ điều kiện hồ bơi|WiFi|Hồ bơi",
        "Không yêu cầu wifi nữa|Hồ bơi|WiFi"
    })
    void droppingOneConstraintPreservesTheRest(String question,String retained,String removed) {
        classify(question,"RECOMMEND_HOTELS","REFINE_SEARCH");
        var result=intents.understand(request(question,memory()));
        assertThat(result.analysis().amenities()).contains(retained).doesNotContain(removed);
        assertThat(result.analysis().maxBudgetPerNight()).isEqualByComparingTo("900000");
        assertThat(result.analysis().starRating()).isEqualTo(4);
        assertThat(result.analysis().city()).isEqualTo("Hồ Chí Minh");
        assertThat(search.amenities()).containsExactly("WiFi","Hồ bơi");
    }

    @Test
    void addingAmenityDoesNotReplaceOthers() {
        String question="Thêm bãi đỗ xe giúp tôi";
        classify(question,"RECOMMEND_HOTELS","REFINE_SEARCH");
        assertThat(intents.understand(request(question,memory())).analysis().amenities()).containsExactly("WiFi","Hồ bơi","Bãi đỗ xe");
    }

    @Test
    void askingForOtherRoomsIsStillPaginationWhenTheModelUsesAComparisonLabel() {
        String question="Có loại phòng khác để tôi cân nhắc không";
        classify(question,"ROOM_COMPARE","MORE_ROOMS");
        var state=new AssistantConversationContext(List.of(),List.of(),null,"ROOM_RECOMMEND",List.of(),search,hotel,List.of());
        var reply=intents.understand(request(question,state));
        assertThat(reply.analysis().intent()).isEqualTo("ROOM_RECOMMEND");
        assertThat(reply.action()).isEqualTo("MORE_ROOMS");
    }

    @Test
    void clearingBudgetDoesNotClearStarsOrDestination() {
        String question="Bỏ giới hạn ngân sách";
        classify(question,"RECOMMEND_HOTELS","REFINE_SEARCH");
        var result=intents.understand(request(question,memory())).analysis();
        assertThat(result.maxBudgetPerNight()).isNull();
        assertThat(result.starRating()).isEqualTo(4);
        assertThat(result.city()).isEqualTo("Hồ Chí Minh");
    }

    @Test
    void totalTripBudgetIsDividedAcrossActualNights() {
        String question="Tìm khách sạn tại Sài Gòn, tổng ngân sách 2 triệu cho cả chuyến đi";
        classify(question,"RECOMMEND_HOTELS","NEW_SEARCH");
        assertThat(intents.understand(request(question,null)).analysis().maxBudgetPerNight()).isEqualByComparingTo("1000000");
    }

    @Test
    void totalGuestCountDoesNotDoubleCountChildren() {
        var result=intents.understand(request("Nhóm 3 người gồm 1 trẻ em",null)).analysis();
        assertThat(result.adults()).isEqualTo(2);
        assertThat(result.children()).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({"WiFi,Wi-Fi miễn phí,true", "Bãi đỗ xe,Bãi đậu xe,true", "Hồ bơi,Bể bơi trong nhà,true", "WiFi,Bãi đậu xe,false"})
    void systemAmenityLabelsUseCanonicalMeaning(String requested,String stored,boolean matches) throws Exception {
        var property=json.readValue("{\"id\":\""+hotel+"\",\"amenities\":[\""+stored+"\"]}",HotelResponse.class);
        assertThat(GroundedAssistantService.allAmenitiesMatch(property,null,List.of(requested))).isEqualTo(matches);
    }

    @Test
    void ambiguousInputAsksBeforeReadingAnyInventory() {
        String question="Cái đó thế nào";
        classify(question,"CLARIFY","NONE");
        var result=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings).answer(request(question,memory()),jwt);
        assertThat(result.answer()).contains("nhu cầu cụ thể");
        assertThat(result.hotels()).isEmpty();
        assertThat(result.rooms()).isEmpty();
        verifyNoInteractions(hotels,bookings);
    }

    @Test
    void proceduralQuestionsAboutAnOwnedBookingUseGuidanceWithoutQueryingPrivateRecords() {
        String question="Làm sao thay đổi hạng phòng cho đơn tôi đã đặt?";
        classify(question,"MY_BOOKINGS","NONE");
        var reply=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings).answer(request(question,null),jwt);
        assertThat(reply.intent()).isEqualTo("GENERAL");
        assertThat(reply.answer()).contains("đổi phòng", "khách sạn xem xét");
        verifyNoInteractions(hotels,bookings);
    }

    @ParameterizedTest
    @CsvSource({"Bạn xem phòng nào được nhất", "Loại nào hợp nhất tại đây", "Tư vấn phòng phù hợp", "phong nao dang chon", "Chọn phòng tốt nhất cho tôi"})
    void anExistingHotelAndRoomSelectionGoalResolveAnUncertainLabel(String question) {
        classify(question,"CLARIFY","NONE");
        assertThat(intents.understand(request(question,null)).analysis().intent()).isEqualTo("ROOM_RECOMMEND");
    }

    @Test
    void genericMoreOptionsUsesTheCurrentObjectAndDoesNotGuessWithoutContext() {
        String question="Còn cái nào khác nữa";
        classify(question,"CLARIFY","MORE_OPTIONS");
        assertThat(intents.understand(request(question,memory())).action()).isEqualTo("MORE_HOTELS");
        var roomState = new AssistantConversationContext(List.of(),List.of(),search,"ROOM_RECOMMEND",List.of(),search,hotel,List.of());
        assertThat(intents.understand(request(question,roomState)).action()).isEqualTo("MORE_ROOMS");
        assertThat(intents.understand(request(question,null)).analysis().intent()).isEqualTo("CLARIFY");
    }

    @Test
    void semanticChangesComposeInsteadOfReplacingTheWholeSearch() {
        String question="Giữ khu vực đó, đừng bắt buộc có hồ bơi, thêm chỗ đỗ xe và tăng tiền lên một triệu rưỡi";
        var slots=new SemanticSlots(null,new BigDecimal("1500000"),"NIGHT",null,null,null,
                List.of("Bãi đỗ xe"),List.of("Hồ bơi"),false,false,null,null,List.of());
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(new SemanticDecision("RECOMMEND_HOTELS",null,"BALANCED",1,1,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned","REFINE_SEARCH",slots)));
        var result=intents.understand(request(question,memory())).analysis();
        assertThat(result.city()).isEqualTo("Hồ Chí Minh");
        assertThat(result.maxBudgetPerNight()).isEqualByComparingTo("1500000");
        assertThat(result.amenities()).containsExactly("WiFi","Bãi đỗ xe");
        assertThat(result.starRating()).isEqualTo(4);
    }

    @Test
    void choosingARoomInASearchResultKeepsTheSearchBudgetAndAmenities() {
        String question="Tư vấn phòng tại khách sạn này";
        classify(question,"ROOM_RECOMMEND","NONE");
        var selected=new AssistantConversationContext(List.of(),List.of(hotel),search,"RECOMMEND_HOTELS",List.of(),null,null,List.of(hotel));
        var result=intents.understand(request(question,selected)).analysis();
        assertThat(result.maxBudgetPerNight()).isEqualByComparingTo("900000");
        assertThat(result.amenities()).containsExactly("WiFi","Hồ bơi");
        var unrelated=new AssistantConversationContext(List.of(),List.of(UUID.randomUUID()),search,"RECOMMEND_HOTELS");
        assertThat(intents.understand(request(question,unrelated)).analysis().maxBudgetPerNight()).isNull();
    }

    @ParameterizedTest
    @CsvSource({"'Bỏ hồ bơi, tổng ngân sách hai triệu cho cả chuyến'", "'Tổng ngân sách hai triệu cho cả chuyến, bỏ hồ bơi'"})
    void removingAnAmenityCannotEraseTheBudgetInAnotherClause(String question) {
        var slots=new SemanticSlots(null,new BigDecimal("2000000"),"TOTAL",null,null,null,List.of(),List.of("Hồ bơi"),null,null,null,null,List.of());
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(new SemanticDecision("CLARIFY",null,"BALANCED",1,1,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned","REFINE_SEARCH",slots)));
        var result=intents.understand(request(question,memory())).analysis();
        assertThat(result.maxBudgetPerNight()).isEqualByComparingTo("1000000");
        assertThat(result.amenities()).containsExactly("WiFi");
        assertThat(result.starRating()).isEqualTo(4);
    }

    @Test
    void unsupportedCriteriaAreAcknowledgedBeforeReadingInventory() {
        String question="Phòng nhìn ra biển";
        var slots=new SemanticSlots(null,null,null,null,null,null,null,null,null,null,null,null,List.of("hướng nhìn ra biển"));
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(new SemanticDecision("ROOM_RECOMMEND",null,"BALANCED",1,1,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned","NONE",slots)));
        var answer=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings).answer(request(question,null),jwt);
        assertThat(answer.answer()).contains("chưa có bộ lọc", "hướng nhìn ra biển");
        verifyNoInteractions(hotels,bookings);
    }

    @Test
    void cheapestRoomStillMustHaveBothBreakfastAndRefundAndKeepThoseRequirements() throws Exception {
        var property=json.readValue("{\"id\":\""+hotel+"\",\"name\":\"Example\",\"status\":\"ACTIVE\"}",HotelResponse.class);
        List<RoomTypeResponse> types=new ArrayList<>();
        for(int i=0;i<4;i++) types.add(json.readValue("""
            {"id":"%s","hotelId":"%s","name":"Room %d","status":"ACTIVE","maxAdults":2,"maxChildren":1,"basePrice":%d,"breakfastIncluded":%s,"refundable":%s}
            """.formatted(UUID.randomUUID(),hotel,i,400000+i*100000,i!=0,i!=1),RoomTypeResponse.class));
        when(hotels.getHotel(hotel)).thenReturn(property);
        when(hotels.getRoomTypes(hotel)).thenReturn(types);
        var slots=new SemanticSlots(null,null,null,null,null,null,null,null,null,null,true,true,List.of());
        var decision=new SemanticDecision("ROOM_RECOMMEND",null,"CHEAPEST",1,1,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned","NONE",slots);
        var criteria=new IntentAnalysis("ROOM_RECOMMEND",null,null,null,2,1,null,null,List.of(),List.of(),null);
        var rooms=new RoomRecommendationService(hotels,bookings);
        var first=rooms.answer(new AssistantRequest("Tiết kiệm, ăn sáng và hoàn tiền",null,null,2,1,hotel,List.of()),criteria,decision,"NONE");
        assertThat(first.rooms()).extracting(AssistantRoomCard::name).containsExactly("Room 2","Room 3");
        var context=new AssistantQueryContext(null,null,null,null,null,2,1,List.of(),false,first.criteria());
        var state=new AssistantConversationContext(List.of(types.get(2).id()),List.of(),null,"ROOM_RECOMMEND",List.of(types.get(2).id()),context,hotel,List.of());
        var next=rooms.answer(new AssistantRequest("Lựa chọn khác",null,null,2,1,hotel,List.of(),state),criteria,null,"MORE_ROOMS");
        assertThat(next.rooms()).extracting(AssistantRoomCard::name).containsExactly("Room 3");
        assertThat(next.criteria().breakfastOnly()).isTrue();
        assertThat(next.criteria().refundableOnly()).isTrue();
    }

    @Test
    void roomPaginationAndOrdinalsUseActualDisplayedIdsAndRespectHotelOwnership() throws Exception {
        HotelResponse property=json.readValue("{\"id\":\""+hotel+"\",\"name\":\"Test Hotel\",\"status\":\"ACTIVE\"}",HotelResponse.class);
        var types=new ArrayList<RoomTypeResponse>();
        for(int i=0;i<7;i++) types.add(json.readValue("""
            {"id":"%s","hotelId":"%s","name":"Type %d","status":"ACTIVE","maxAdults":2,"maxChildren":1,"basePrice":%d}
            """.formatted(UUID.randomUUID(),hotel,i,500000+i*10000),RoomTypeResponse.class));
        when(hotels.getHotel(hotel)).thenReturn(property);
        when(hotels.getRoomTypes(hotel)).thenReturn(types);
        var criteria=new IntentAnalysis("ROOM_RECOMMEND",null,null,null,2,1,null,null,List.of(),List.of(),null);
        var service=new RoomRecommendationService(hotels,bookings);
        var seen=new ArrayList<UUID>();
        List<UUID> last=List.of();
        for(int page=0;page<4;page++) {
            var state=new AssistantConversationContext(last,List.of(),null,"ROOM_RECOMMEND",List.copyOf(seen),null,hotel,List.of());
            var reply=service.answer(new AssistantRequest("Phòng khác",null,null,2,1,hotel,List.of(),state),criteria,null,"MORE_ROOMS");
            assertThat(reply.rooms()).hasSize(page<2?3:page==2?1:0);
            for(var room:reply.rooms()) { assertThat(seen).doesNotContain(room.id()); seen.add(room.id()); }
            if(!reply.rooms().isEmpty()) last=reply.rooms().stream().map(AssistantRoomCard::id).toList();
        }
        assertThat(seen).hasSize(7);
        var display=List.of(types.get(4).id(),types.get(1).id(),types.get(6).id());
        var state=new AssistantConversationContext(display,List.of(),null,"ROOM_RECOMMEND",seen,null,hotel,List.of());
        var reply=service.answer(new AssistantRequest("Xem phòng thứ hai",null,null,2,1,hotel,List.of(),state),criteria,null,"SELECT_OPTION");
        assertThat(reply.rooms()).extracting(AssistantRoomCard::id).containsExactly(types.get(1).id());
        var foreign=new AssistantConversationContext(display,List.of(),null,"ROOM_RECOMMEND",seen,null,UUID.randomUUID(),List.of());
        assertThat(service.answer(new AssistantRequest("Xem phòng thứ hai",null,null,2,1,hotel,List.of(),foreign),criteria,null,"SELECT_OPTION").rooms()).isEmpty();
        verifyNoInteractions(bookings);
    }

    @Test
    void roomComparisonUsesTheSpecifiedDisplayedPositionsAndDoesNotSubstituteUnavailableRooms() throws Exception {
        var property=json.readValue("{\"id\":\""+hotel+"\",\"name\":\"Example\",\"status\":\"ACTIVE\"}",HotelResponse.class);
        var types=new ArrayList<RoomTypeResponse>();
        for(int i=0;i<3;i++) types.add(json.readValue("""
            {"id":"%s","hotelId":"%s","name":"Room %d","status":"ACTIVE","maxAdults":2,"maxChildren":1,"basePrice":%d}
            """.formatted(UUID.randomUUID(),hotel,i,400000+i*100000),RoomTypeResponse.class));
        when(hotels.getHotel(hotel)).thenReturn(property);
        when(hotels.getRoomTypes(hotel)).thenReturn(types);
        var roster=List.of(types.get(2).id(),types.get(0).id(),types.get(1).id());
        var state=new AssistantConversationContext(roster,List.of(),null,"ROOM_RECOMMEND",List.of(),null,hotel,List.of());
        var criteria=new IntentAnalysis("ROOM_COMPARE",null,null,null,2,1,null,null,List.of(),List.of(),null);
        var rooms=new RoomRecommendationService(hotels,bookings);
        var request=new AssistantRequest("So sánh phòng 1,3",null,null,2,1,hotel,List.of(),state);
        var reply=rooms.answer(request,criteria,null,"NONE");
        assertThat(reply.rooms()).extracting(AssistantRoomCard::id).containsExactly(roster.get(0),roster.get(2));
        when(hotels.getRoomTypes(hotel)).thenReturn(types.subList(0,1));
        assertThat(rooms.answer(request,criteria,null,"NONE").rooms()).isEmpty();
    }
}
