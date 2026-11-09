package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.booking.BookingClient;
import com.smarthotel.ai.integration.booking.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.Jwt;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DialogueHotelSearchTest {
    private final HotelClient hotels = mock(HotelClient.class);
    private final BookingClient bookings = mock(BookingClient.class);
    private final LocalSemanticClient semantic = mock(LocalSemanticClient.class);
    private final IntentAnalysisService intents = new IntentAnalysisService(semantic);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final Jwt jwt = Jwt.withTokenValue("test-token").header("alg", "HS256").subject(UUID.randomUUID().toString()).build();
    private final LocalDate start = LocalDate.now().plusDays(2);
    private GroundedAssistantService service;
    private List<HotelWithRoomTypes> catalog;

    @BeforeEach
    void setup() throws Exception {
        List<HotelWithRoomTypes> rows = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            UUID hotelId = UUID.randomUUID();
            HotelResponse hotel = json.readValue("""
                    {"id":"%s","name":"Hotel %d","city":"%s","status":"ACTIVE","starRating":3,"amenities":["WiFi"]}
                    """.formatted(hotelId, index, index == 7 ? "Nha Trang" : "Hồ Chí Minh"), HotelResponse.class);
            UUID typeId = UUID.randomUUID();
            RoomTypeResponse type = json.readValue("""
                    {"id":"%s","hotelId":"%s","name":"Family","status":"ACTIVE","basePrice":%d,"maxAdults":2,"maxChildren":1}
                    """.formatted(typeId, hotelId, index == 7 ? 2000000 : 600000 + index * 10000), RoomTypeResponse.class);
            rows.add(new HotelWithRoomTypes(hotel, List.of(type)));
            lenient().when(hotels.getHotel(hotelId)).thenReturn(hotel);
            lenient().when(hotels.getRoomTypes(hotelId)).thenReturn(List.of(type));
            lenient().when(hotels.getRooms(hotelId)).thenReturn(List.of(new RoomResponse(UUID.randomUUID(), hotelId, typeId, "101", 1, "AVAILABLE", null, null)));
        }
        catalog = List.copyOf(rows);
        lenient().when(hotels.getHotelsWithRoomTypes()).thenReturn(catalog);
        lenient().when(hotels.getHotels()).thenReturn(catalog.stream().map(HotelWithRoomTypes::hotel).toList());
        lenient().when(hotels.getHotelsWithRoomTypes(anyList())).thenAnswer(call -> {
            List<UUID> ids=call.getArgument(0);
            return catalog.stream().filter(row -> ids.contains(row.hotel().id())).toList();
        });
        when(bookings.getReviewSummary(any())).thenAnswer(call -> new ReviewSummaryResponse(call.getArgument(0), 0, null, Map.of(), Map.of()));
        when(bookings.getAvailability(any(), any(), any())).thenAnswer(call -> new AvailabilityResponse(call.getArgument(0), call.getArgument(1), call.getArgument(2), List.of()));
        service = new GroundedAssistantService(intents, new SystemKnowledgeService(), hotels, bookings);
    }

    private void classify(String question, String intent, String action) {
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(
                new SemanticDecision(intent, null, "BALANCED", .95, .06, "Xenova/multilingual-e5-small", "pinned", action)));
    }

    private AssistantRequest request(String question, UUID focused, AssistantConversationContext context) {
        return new AssistantRequest(question, start, start.plusDays(1), 2, 1, focused, List.of(), context);
    }

    @ParameterizedTest
    @ValueSource(strings={"ở đây có những phòng nào","có loại phòng nào","những phòng nào ở đây","Xem các phòng","What rooms are available here?"})
    void aSingleVisibleResultSuppliesTheHotelWithoutRepeatingItsNameOrKeepingTextHistory(String question) {
        classify(question,"HOTEL_DETAILS","NONE");
        var id=catalog.get(1).hotel().id();
        var search=new AssistantQueryContext("Hồ Chí Minh",new BigDecimal("700000"),null,start,start.plusDays(2),2,1,List.of(),true);
        var state=new AssistantConversationContext(List.of(),List.of(id),search,"RECOMMEND_HOTELS",List.of(),null,null,List.of(id),List.of(id));
        // The UI may have discarded the earlier text. The displayed IDs remain authoritative references.
        var input=new AssistantRequest(question,start,start.plusDays(2),2,1,null,List.of(),state);
        var reply=service.answer(input,jwt);
        assertThat(reply.intent()).isEqualTo("ROOM_RECOMMEND");
        assertThat(reply.rooms()).isNotEmpty().allSatisfy(room->assertThat(room.hotelId()).isEqualTo(id));
        assertThat(reply.context().maxBudgetPerNight()).isEqualByComparingTo("700000");
        assertThat(reply.context().children()).isEqualTo(1);
        assertThat(reply.context().checkOut()).isEqualTo(start.plusDays(2));
        verify(semantic).classify(argThat(r->id.equals(r.hotelId())));
    }

    @Test
    void aNewEmptySearchCannotResurrectAHistoricalHotel() {
        String question="ở đây có những phòng nào";
        classify(question,"ROOM_RECOMMEND","NONE");
        var old=catalog.get(0).hotel().id();
        var state=new AssistantConversationContext(List.of(),List.of(),null,"RECOMMEND_HOTELS",List.of(),null,null,List.of(),List.of());
        var input=new AssistantRequest(question,start,start.plusDays(1),2,1,null,
                List.of(new AssistantMessage("assistant","Hotel 0")),state);
        var reply=service.answer(input,jwt);
        assertThat(reply.rooms()).isEmpty();
        verify(hotels,never()).getHotel(old);
        verify(semantic).classify(argThat(r->r.hotelId()==null));
    }

    @Test
    void roomConversationCarriesItsPropertyWithoutAnyHotelSearchCards() {
        String question="có loại phòng nào";
        classify(question,"ROOM_RECOMMEND","NONE");
        var id=catalog.get(1).hotel().id();
        var search=new AssistantQueryContext(null,new BigDecimal("700000"),null,start,start.plusDays(1),2,1,List.of(),true);
        var state=new AssistantConversationContext(List.of(),List.of(),null,"ROOM_RECOMMEND",List.of(),search,id,List.of(),List.of());
        var reply=service.answer(new AssistantRequest(question,start,start.plusDays(1),2,1,null,List.of(),state),jwt);
        assertThat(reply.rooms()).isNotEmpty().allSatisfy(room->assertThat(room.hotelId()).isEqualTo(id));
        assertThat(reply.context().maxBudgetPerNight()).isEqualByComparingTo("700000");
    }

    @ParameterizedTest
    @ValueSource(strings={"Xem các phòng của khách sạn đó","Liệt kê các loại phòng ở khách sạn này","Show all rooms at that hotel"})
    void aHotelReferenceAfterAdviceResolvesItsIdentityAndKeepsSearchConstraints(String question) {
        classify(question,"HOTEL_DETAILS","NONE");
        var ids=catalog.stream().limit(2).map(row->row.hotel().id()).toList();
        var search=new AssistantQueryContext("Hồ Chí Minh",new BigDecimal("700000"),null,start,start.plusDays(1),2,1,List.of(),true);
        var state=new AssistantConversationContext(List.of(),ids,search,"COMPARE_HOTELS",List.of(),null,null,ids,ids);
        var input=new AssistantRequest(question,start,start.plusDays(1),2,1,null,
                List.of(new AssistantMessage("assistant","Tôi ưu tiên Hotel 1 vì tiện nghi công bố.")),state);
        var reply=service.answer(input,jwt);
        assertThat(reply.rooms()).isNotEmpty().allSatisfy(room->assertThat(room.hotelId()).isEqualTo(ids.get(1)));
        assertThat(reply.context().maxBudgetPerNight()).isEqualByComparingTo("700000");
        assertThat(reply.context().adults()).isEqualTo(2);
        verify(semantic).classify(argThat(r->ids.get(1).equals(r.hotelId())));
    }

    @Test
    void aReferenceToAnAmbiguousComparisonCannotChooseTheFirstHotel() {
        String question="Xem các phòng của khách sạn đó";
        classify(question,"ROOM_RECOMMEND","NONE");
        var ids=catalog.stream().limit(2).map(row->row.hotel().id()).toList();
        var state=new AssistantConversationContext(List.of(),ids,null,"COMPARE_HOTELS",List.of(),null,null,ids,ids);
        var input=new AssistantRequest(question,start,start.plusDays(1),2,1,null,
                List.of(new AssistantMessage("assistant","So sánh Hotel 0 và Hotel 1")),state);
        var reply=service.answer(input,jwt);
        assertThat(reply.rooms()).isEmpty();
        verify(semantic).classify(argThat(r->r.hotelId()==null));
    }

    @Test
    void askingForReviewsOfTheAdvisedHotelIsANewTaskRatherThanAnotherComparison() {
        String question="Xem đánh giá khách sạn đó";
        classify(question,"REVIEW_SUMMARY","NONE");
        var ids=catalog.stream().limit(2).map(row->row.hotel().id()).toList();
        var state=new AssistantConversationContext(List.of(),ids,null,"COMPARE_HOTELS",List.of(),null,null,ids,ids);
        var reply=service.answer(new AssistantRequest(question,start,start.plusDays(1),2,1,null,
                List.of(new AssistantMessage("assistant","Tôi ưu tiên Hotel 1 vì tiện nghi công bố.")),state),jwt);
        assertThat(reply.intent()).isEqualTo("REVIEW_SUMMARY");
        assertThat(reply.comparison()).isNull();
        verify(bookings,atLeastOnce()).getReviewSummary(ids.get(1));
        verify(bookings,never()).getReviewSummary(ids.get(0));
    }

    @ParameterizedTest
    @ValueSource(strings={"nên ưu tiên khách sạn nào","Bạn chọn giúp tôi nơi đáng ở hơn","2 khách sạn bạn so sánh đấy"})
    void adviceReadsOnlyTheComparedPairAndDoesNotRepeatATableOrDiscoverOtherHotels(String question) {
        classify(question,"COMPARE_HOTELS","CHOOSE_OPTION");
        var roster=catalog.stream().limit(3).map(row->row.hotel().id()).toList();
        var search=new AssistantQueryContext("Hồ Chí Minh",null,null,start,start.plusDays(1),2,1,List.of(),true);
        var state=new AssistantConversationContext(List.of(),roster,search,"COMPARE_HOTELS",List.of(),null,null,roster.subList(0,2),roster);
        var reply=service.answer(request(question,null,state),jwt);
        assertThat(reply.conversationAction()).isEqualTo("CHOOSE_OPTION");
        assertThat(reply.comparison()).isNull();
        assertThat(reply.hotels()).isEmpty();
        assertThat(reply.answer()).contains("Bạn ưu tiên");
        assertThat(reply.context().adults()).isEqualTo(2);
        assertThat(reply.context().children()).isEqualTo(1);
        verify(hotels,never()).getHotelsWithRoomTypes();
        verify(hotels).getHotelsWithRoomTypes(roster.subList(0,2));
        verify(bookings,times(2)).getAvailability(any(),any(),any());
        verify(bookings,never()).getReviewSummary(roster.get(2));
    }

    @ParameterizedTest
    @ValueSource(strings={"so sánh cả 3 khách sạn xem","So sánh cả ba khách sạn đã giới thiệu","So sánh toàn bộ khách sạn vừa gợi ý"})
    void comparesTheEntireRecommendedRosterAndRepairsStaleGuestCounts(String question) {
        classify(question,"COMPARE_HOTELS","NONE");
        var roster=catalog.stream().limit(3).map(row->row.hotel().id()).toList();
        var search=new AssistantQueryContext("Hồ Chí Minh",null,null,start,start.plusDays(1),2,1,List.of(),true);
        var memory=new AssistantConversationContext(List.of(),roster,search,"COMPARE_HOTELS",List.of(),null,null,roster.subList(0,2),roster);
        var input=new AssistantRequest(question,start,start.plusDays(1),3,1,null,List.of(),memory);
        var reply=service.answer(input,jwt);
        assertThat(reply.hotels()).extracting(AssistantHotelCard::hotelId).containsExactlyElementsOf(roster);
        assertThat(reply.context().adults()).isEqualTo(2);
        assertThat(reply.context().children()).isEqualTo(1);
        assertThat(reply.comparison()).isNotNull();
        assertThat(reply.comparison().rows()).allSatisfy(row->assertThat(row.values()).hasSize(3));
        assertThat(reply.comparison().rows()).extracting(AssistantHotelComparison.Row::label)
                .contains("Tiện nghi công bố","Bữa sáng (loại phòng)","Hoàn tiền (loại phòng)","Đánh giá khách","Sức chứa");
    }

    @Test
    void aQualityFollowupRetainsAllComparedHotelsAndCannotInventAServiceRanking() {
        var roster=catalog.stream().limit(3).map(row->row.hotel().id()).toList();
        var search=new AssistantQueryContext("Hồ Chí Minh",null,null,start,start.plusDays(1),2,1,List.of(),true);
        var state=new AssistantConversationContext(List.of(),roster,search,"COMPARE_HOTELS",List.of(),null,null,roster,roster);
        for(String question:List.of("so sánh chất lượng ấy","chất lượng dịch vụ ấy")) {
            classify(question,"CLARIFY","NONE");
            var reply=service.answer(request(question,null,state),jwt);
            assertThat(reply.intent()).isEqualTo("COMPARE_HOTELS");
            assertThat(reply.hotels()).hasSize(3);
            assertThat(reply.comparison().focus()).isEqualTo("QUALITY");
            assertThat(reply.comparison().rows()).extracting(AssistantHotelComparison.Row::label).doesNotContain("Giá cơ bản / đêm");
            assertThat(reply.answer()).doesNotContain("₫");
            assertThat(reply.comparison().note()).contains("Chưa đủ đánh giá");
            assertThat(reply.comparison().rows().stream().filter(row->row.label().equals("Bữa sáng (loại phòng)")).findFirst().orElseThrow().values()).containsOnly("Chưa cung cấp");
        }
    }

    @Test
    void anObjectCountDoesNotBecomeThePartySizeWithoutSemanticInference() {
        var input=new AssistantRequest("So sánh cả 3 khách sạn",null,null,2,1,null,List.of());
        assertThat(new IntentAnalysisService().analyze(input).adults()).isEqualTo(2);
        assertThat(new IntentAnalysisService().analyze(new AssistantRequest("So sánh cho 3 người lớn",null,null,2,1,null,List.of())).adults()).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings={"NONE","MORE_HOTELS","MORE_ROOMS","MORE_OPTIONS","SELECT_OPTION","NEW_SEARCH","REFINE_SEARCH","RECHECK_TRIP"})
    void comparisonCannotBeReplacedByAnIncompatibleModelAction(String action) {
        String question="so sánh cho tôi khách sạn 1,3";
        classify(question,"COMPARE_HOTELS",action);
        List<UUID> roster=List.of(catalog.get(4).hotel().id(),catalog.get(0).hotel().id(),catalog.get(2).hotel().id());
        var search=new AssistantQueryContext("Hồ Chí Minh",new BigDecimal("900000"),null,start,start.plusDays(1),2,1,List.of("WiFi"),true);
        var memory=new AssistantConversationContext(List.of(),roster,search,"RECOMMEND_HOTELS",List.of(),null,null,roster);
        var reply=service.answer(request(question,roster.get(1),memory),jwt);
        assertThat(reply.intent()).isEqualTo("COMPARE_HOTELS");
        assertThat(reply.conversationAction()).isEqualTo("NONE");
        assertThat(reply.hotels()).extracting(AssistantHotelCard::hotelId).containsExactly(roster.get(0),roster.get(2));
        assertThat(reply.context().maxBudgetPerNight()).isEqualByComparingTo("900000");
        assertThat(reply.answer()).contains("So sánh", "Hotel 4", "Hotel 2").doesNotContain("Hotel 0");
    }

    @Test
    void explicitComparisonIsRecoveredEvenWhenTheModelLabelsItAsDiscovery() {
        String question="So sánh khách sạn 2 và 3";
        classify(question,"RECOMMEND_HOTELS","MORE_HOTELS");
        List<UUID> roster=catalog.stream().limit(3).map(row->row.hotel().id()).toList();
        var memory=new AssistantConversationContext(List.of(),roster,null,"RECOMMEND_HOTELS",List.of(),null,null,roster);
        var reply=service.answer(request(question,null,memory),jwt);
        assertThat(reply.intent()).isEqualTo("COMPARE_HOTELS");
        assertThat(reply.hotels()).extracting(AssistantHotelCard::hotelId).containsExactly(roster.get(1),roster.get(2));
    }

    @ParameterizedTest
    @ValueSource(strings={"So sánh khách sạn 1,9","So sánh khách sạn 1,1","So sánh khách sạn 0,3"})
    void invalidComparisonAsksForTheOptionsInsteadOfInventingAlternatives(String question) {
        classify(question,"COMPARE_HOTELS","MORE_HOTELS");
        var roster=catalog.stream().limit(3).map(row->row.hotel().id()).toList();
        var memory=new AssistantConversationContext(List.of(),roster,null,"RECOMMEND_HOTELS",List.of(),null,null,roster);
        var reply=service.answer(request(question,null,memory),jwt);
        assertThat(reply.intent()).isEqualTo("COMPARE_HOTELS");
        assertThat(reply.hotels()).isEmpty();
        assertThat(reply.answer()).contains("số thứ tự");
    }

    @Test
    void refundAndIncludedBreakfastAreBothRequiredAndPersistForOtherHotels() throws Exception {
        List<HotelWithRoomTypes> configured = new ArrayList<>();
        for(int i=0;i<catalog.size();i++) {
            var item=catalog.get(i);
            var node=(com.fasterxml.jackson.databind.node.ObjectNode)json.valueToTree(item.roomTypes().get(0));
            node.put("refundable",i!=1);
            node.put("breakfastIncluded",i==1||i==2);
            configured.add(new HotelWithRoomTypes(item.hotel(),List.of(json.treeToValue(node,RoomTypeResponse.class))));
        }
        when(hotels.getHotelsWithRoomTypes()).thenReturn(configured);
        String question="Tìm khách sạn tại Sài Gòn có bữa sáng và hoàn tiền";
        var slots=new SemanticSlots("Hồ Chí Minh",null,null,null,null,null,List.of("Bữa sáng"),null,null,null,true,true,List.of());
        when(semantic.classify(argThat(r -> r != null && question.equals(r.message())))).thenReturn(Optional.of(new SemanticDecision("RECOMMEND_HOTELS",null,"BALANCED",1,1,"Qwen3-4B-Instruct-2507-Q4_K_M","pinned","NEW_SEARCH",slots)));
        var first=service.answer(request(question,null,null),jwt);
        assertThat(first.hotels()).extracting(AssistantHotelCard::hotelId).containsExactly(catalog.get(2).hotel().id());
        assertThat(first.hotels().get(0).refundable()).isTrue();
        assertThat(first.hotels().get(0).breakfastIncluded()).isTrue();
        assertThat(first.context().roomCriteria().refundableOnly()).isTrue();
        String other="Khách sạn khác nữa";
        classify(other,"RECOMMEND_HOTELS","MORE_HOTELS");
        var next=service.answer(request(other,null,new AssistantConversationContext(List.of(),List.of(first.hotels().get(0).hotelId()),first.context(),"RECOMMEND_HOTELS")),jwt);
        assertThat(next.hotels()).isEmpty();
        assertThat(next.answer()).contains("giới thiệu hết");
    }

    @Test
    void fullConversationShowsDifferentHotelsUntilExhaustedWithoutLosingCriteria() {
        String initialQuestion = "Tôi cần phòng ở Sài Gòn dưới 900k, có wifi, 3 sao";
        classify(initialQuestion, "ROOM_RECOMMEND", "NEW_SEARCH");
        AssistantResponse first = service.answer(request(initialQuestion, null, null), jwt);
        assertThat(first.hotels()).hasSize(3);
        assertThat(first.context().city()).isEqualTo("Hồ Chí Minh");
        assertThat(first.context().maxBudgetPerNight()).isEqualByComparingTo("900000");
        assertThat(first.conversationAction()).isEqualTo("NEW_SEARCH");

        String moreQuestion = "Còn khách sạn nào khác không";
        classify(moreQuestion, "ROOM_RECOMMEND", "MORE_HOTELS");
        List<UUID> seen = new ArrayList<>(first.hotels().stream().map(AssistantHotelCard::hotelId).toList());
        UUID staleFocus = first.hotels().get(0).hotelId();
        AssistantResponse second = service.answer(request(moreQuestion, staleFocus,
                new AssistantConversationContext(List.of(), seen, first.context(), "RECOMMEND_HOTELS")), jwt);
        assertThat(second.hotels()).hasSize(3);
        assertThat(second.hotels()).allSatisfy(card -> assertThat(seen).doesNotContain(card.hotelId()));
        assertThat(second.context().maxBudgetPerNight()).isEqualByComparingTo("900000");
        assertThat(second.context().amenities()).contains("WiFi");
        assertThat(second.context().starRating()).isEqualTo(3);
        assertThat(second.context().checkIn()).isEqualTo(start);
        assertThat(second.context().children()).isEqualTo(1);
        seen.addAll(second.hotels().stream().map(AssistantHotelCard::hotelId).toList());

        AssistantResponse third = service.answer(request(moreQuestion, staleFocus,
                new AssistantConversationContext(List.of(), seen, second.context(), "RECOMMEND_HOTELS")), jwt);
        assertThat(third.hotels()).hasSize(1);
        assertThat(seen).doesNotContain(third.hotels().get(0).hotelId());
        seen.add(third.hotels().get(0).hotelId());
        AssistantResponse exhausted = service.answer(request(moreQuestion, staleFocus,
                new AssistantConversationContext(List.of(), seen, third.context(), "RECOMMEND_HOTELS")), jwt);
        assertThat(exhausted.hotels()).isEmpty();
        assertThat(exhausted.answer()).contains("giới thiệu hết", "tiêu chí hiện tại");
        assertThat(exhausted.context().city()).isEqualTo("Hồ Chí Minh");
    }

    @Test
    void changingDestinationStartsANewSearchInsteadOfInheritingTheOldBudget() {
        String question = "Tìm khách sạn ở Nha Trang";
        classify(question, "RECOMMEND_HOTELS", "NEW_SEARCH");
        AssistantQueryContext previous = new AssistantQueryContext("Hồ Chí Minh", new BigDecimal("900000"), 3,
                start, start.plusDays(1), 2, 1, List.of("WiFi"), true);
        AssistantResponse answer = service.answer(request(question, catalog.get(0).hotel().id(),
                new AssistantConversationContext(List.of(), catalog.stream().map(row -> row.hotel().id()).toList(), previous, "RECOMMEND_HOTELS")), jwt);
        assertThat(answer.hotels()).hasSize(1);
        assertThat(answer.hotels().get(0).city()).isEqualTo("Nha Trang");
        assertThat(answer.context().maxBudgetPerNight()).isNull();
    }

    @Test
    void recheckingTripUsesTheSearchContextAndNewDatesInsteadOfAskingForAHotelName() {
        String question = "Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn";
        classify(question, "ROOM_RECOMMEND", "RECHECK_TRIP");
        AssistantQueryContext previous = new AssistantQueryContext("Hồ Chí Minh", null, null,
                start.minusDays(1), start, 2, 1, List.of(), true);
        AssistantResponse answer = service.answer(request(question, null,
                new AssistantConversationContext(List.of(), List.of(), previous, "RECOMMEND_HOTELS")), jwt);
        assertThat(answer.hotels()).hasSize(3);
        assertThat(answer.context().checkIn()).isEqualTo(start);
        assertThat(answer.answer()).doesNotContain("khách sạn nào");
        verify(bookings, atLeastOnce()).getAvailability(any(), eq(start), eq(start.plusDays(1)));
    }

    @Test
    void firstRecheckWithoutAnyDestinationAsksForTheCityRatherThanAHotelName() {
        String question = "Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn";
        classify(question, "ROOM_RECOMMEND", "RECHECK_TRIP");
        assertThat(service.answer(request(question, null, null), jwt).answer()).contains("tỉnh/thành");
    }

    @Test
    void otherHotelsFromAHotelPageUsesItsCityAndExcludesThatHotel() {
        String question = "Còn khách sạn nào khác không";
        classify(question, "RECOMMEND_HOTELS", "MORE_HOTELS");
        UUID focused = catalog.get(0).hotel().id();
        AssistantResponse answer = service.answer(request(question, focused, null), jwt);
        assertThat(answer.hotels()).hasSize(3).allSatisfy(card -> assertThat(card.hotelId()).isNotEqualTo(focused));
        assertThat(answer.context().city()).isEqualTo("Hồ Chí Minh");
    }
}
