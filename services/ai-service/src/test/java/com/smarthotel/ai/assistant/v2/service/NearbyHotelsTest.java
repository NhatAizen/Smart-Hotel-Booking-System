package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.*;
import com.smarthotel.ai.integration.booking.BookingClient;
import com.smarthotel.ai.integration.booking.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import java.time.LocalDate;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class NearbyHotelsTest {
    @Test void aCityValueCannotOverwriteThePendingOrResolvedPoiEvenWithAnIncorrectPlannerSlot() throws Exception {
        for(boolean resolved:List.of(false,true)) {
            var point=resolved?new NearbyLocation("nhà ga T1",5.,"T1 Tân Sơn Nhất",10.8137889,106.6620986,"https://www.openstreetmap.org/way/196966091"):NearbyLocation.requested("nhà ga T1",5.);
            var search=new AssistantQueryContext("Hồ Chí Minh",new java.math.BigDecimal("1200000"),null,start,start.plusDays(2),2,1,List.of("WiFi"),resolved,null,point);
            var memory=new AssistantConversationContext(List.of(),List.of(),search,"RECOMMEND_HOTELS");
            // The Java boundary must protect typed state even if interpretation
            // erroneously emits the city in both fields.
            classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Hồ Chí Minh\",\"landmark\":\"Sài Gòn\"}");
            var result=intents.understand(new AssistantRequest("SÀI GÒN",null,null,null,null,null,List.of(),memory));
            assertThat(result.analysis().nearby().query()).isEqualTo("nhà ga T1");
            assertThat(result.analysis().city()).isEqualTo("Hồ Chí Minh");
            assertThat(result.analysis().maxBudgetPerNight()).isEqualByComparingTo("1200000");
            assertThat(result.action()).isEqualTo("REFINE_SEARCH");
        }
    }
    @Test void cityClarificationCompletesThePendingSearchInsteadOfDiscardingItsCriteria() throws Exception {
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Hồ Chí Minh\"}");
        var search=new AssistantQueryContext(null,new java.math.BigDecimal("1200000"),3,start,start.plusDays(2),2,1,List.of("WiFi"),false,null,NearbyLocation.requested("nhà ga T3",3.));
        var memory=new AssistantConversationContext(List.of(),List.of(),search,"RECOMMEND_HOTELS");
        for(String reply:List.of("ở SÀI GÒN","Hồ Chí Minh","tại TP.HCM")) {
            var result=intents.understand(new AssistantRequest(reply,null,null,null,null,null,List.of(),memory));
            assertThat(result.analysis().nearby().query()).isEqualTo("nhà ga T3");
            assertThat(result.analysis().nearby().radiusKm()).isEqualTo(3);
            assertThat(result.analysis().city()).isEqualTo("Hồ Chí Minh");
            assertThat(result.analysis().maxBudgetPerNight()).isEqualByComparingTo("1200000");
            assertThat(result.analysis().starRating()).isEqualTo(3);
            assertThat(result.analysis().amenities()).contains("WiFi");
            assertThat(result.analysis().adults()).isEqualTo(2);
            assertThat(result.analysis().children()).isEqualTo(1);
            assertThat(result.analysis().checkIn()).isEqualTo(start);
            assertThat(result.analysis().checkOut()).isEqualTo(start.plusDays(2));
            assertThat(result.action()).isEqualTo("REFINE_SEARCH");
        }
        assertThat(DialoguePolicy.cityReply("Tìm khách sạn ở Sài Gòn","Hồ Chí Minh")).isFalse();
        assertThat(DialoguePolicy.cityReply("Cần Thơ","Cần Thơ")).isTrue();
        var found=new NearbyLocation("nhà ga T3",3.,"T3 Tân Sơn Nhất",10.8122002,106.654338,"https://www.openstreetmap.org/way/1240951104");
        var resolvedSearch=new AssistantQueryContext("Hồ Chí Minh",search.maxBudgetPerNight(),3,start,start.plusDays(2),2,1,List.of("WiFi"),true,null,found);
        var resolvedState=new AssistantConversationContext(List.of(),List.of(),resolvedSearch,"RECOMMEND_HOTELS");
        var repeated=intents.understand(new AssistantRequest("ở SÀI GÒN",null,null,null,null,null,List.of(),resolvedState));
        assertThat(repeated.analysis().nearby().query()).isEqualTo("nhà ga T3");
        assertThat(repeated.analysis().maxBudgetPerNight()).isEqualByComparingTo("1200000");
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Hà Nội\"}");
        assertThat(intents.understand(new AssistantRequest("Hà Nội",null,null,null,null,null,List.of(),resolvedState)).analysis().nearby()).isNull();
    }
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final LocalSemanticClient semantic = mock(LocalSemanticClient.class);
    private final IntentAnalysisService intents = new IntentAnalysisService(semantic);
    private final LocalDate start = LocalDate.now().plusDays(2);
    private final UUID focused = UUID.randomUUID();
    private AssistantRequest request(String message, NearbyLocation nearby) {
        var search = new AssistantQueryContext("Hồ Chí Minh",null,null,start,start.plusDays(2),2,1,List.of(),true,null,nearby);
        var state = new AssistantConversationContext(List.of(focused),List.of(focused),search,"ROOM_RECOMMEND",List.of(UUID.randomUUID()),search,focused,List.of(focused),List.of(focused));
        return new AssistantRequest(message,start,start.plusDays(2),2,1,focused,List.of(),state);
    }
    private void classify(String intent, String action, String slots) throws Exception {
        var decision=json.readValue("{\"intent\":\""+intent+"\",\"action\":\""+action+"\",\"preference\":\"BALANCED\",\"slots\":"+slots+"}",SemanticDecision.class);
        when(semantic.classify(any(AssistantRequest.class))).thenReturn(Optional.of(decision));
    }
    @Test void explicitHotelTaskWinsOverPreviousRoomRefinement() throws Exception {
        classify("RECOMMEND_HOTELS","REFINE_SEARCH","{\"city\":\"Đà Nẵng\"}");
        var result=intents.understand(request("Tìm khách sạn ở Đà Nẵng",null));
        assertThat(result.analysis().intent()).isEqualTo("RECOMMEND_HOTELS");
        assertThat(result.analysis().city()).isEqualTo("Đà Nẵng");
        assertThat(result.analysis().adults()).isEqualTo(2);
        assertThat(result.analysis().children()).isEqualTo(1);
    }
    @Test void newLandmarkOverridesRoomScopeAndUntrustedCoordinatesAreDiscarded() throws Exception {
        classify("ROOM_RECOMMEND","REFINE_SEARCH","{\"landmark\":\"nhà ga T3\"}");
        var result=intents.understand(request("Tôi cần khách sạn ở gần nhà ga T3",null));
        assertThat(result.analysis().intent()).isEqualTo("RECOMMEND_HOTELS");
        assertThat(result.action()).isEqualTo("NEW_SEARCH");
        assertThat(result.analysis().nearby().query()).isEqualTo("nhà ga T3");
        assertThat(result.analysis().nearby().radiusKm()).isEqualTo(5);
        classify("RECOMMEND_HOTELS","REFINE_SEARCH","{\"radiusKm\":2}");
        var changed=intents.understand(request("Bán kính 2 km thôi",new NearbyLocation("nhà ga T3",5.,"FAKE",0.,0.,"https://bad.invalid")));
        assertThat(changed.analysis().nearby().radiusKm()).isEqualTo(2);
        assertThat(changed.analysis().nearby().latitude()).isNull();
        assertThat(changed.analysis().nearby().sourceUrl()).isNull();
    }
    @Test void radiusRemovalAndNewDestinationClearPreviousProximity() throws Exception {
        var old = new NearbyLocation("nhà ga T3",5.,"T3",10.8122,106.6543,"https://www.openstreetmap.org/way/1240951104");
        classify("RECOMMEND_HOTELS","REFINE_SEARCH","{\"clearNearby\":true}");
        assertThat(intents.understand(request("Bỏ điều kiện gần nhà ga",old)).analysis().nearby()).isNull();
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Huế\"}");
        assertThat(intents.understand(request("Đổi sang Huế",old)).analysis().nearby()).isNull();
    }
    @Test void verifiedT3NeedsCityAndUsesMapCoordinates() {
        var resolver=new LandmarkResolver();
        assertThat(resolver.resolve(NearbyLocation.requested("nhà ga T3",null),null).status()).isEqualTo("AMBIGUOUS");
        var point=resolver.resolve(NearbyLocation.requested("nhà ga T3",null),"Hồ Chí Minh").choices().get(0);
        assertThat(point.latitude()).isEqualTo(10.8122002);
        assertThat(point.longitude()).isEqualTo(106.654338);
        assertThat(LandmarkResolver.distance(point.latitude(),point.longitude(),point.latitude(),point.longitude())).isZero();
        assertThat(resolver.resolve(NearbyLocation.requested("bệnh viện",null),"Hồ Chí Minh").status()).isEqualTo("AMBIGUOUS");
        assertThat(resolver.resolve(NearbyLocation.requested("Nhà hát ABC",null),"Hồ Chí Minh").status()).isEqualTo("UNAVAILABLE");
        for(String name : List.of("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất", "T3 — Sân bay quốc tế Tân Sơn Nhất", "Nhà ga Nội địa T3")) {
            var result=resolver.resolve(NearbyLocation.requested(name,2.),"Hồ Chí Minh");
            assertThat(result.status()).isEqualTo("FOUND");
            assertThat(result.choices().get(0).latitude()).isEqualTo(point.latitude());
        }
        assertThat(resolver.resolve(NearbyLocation.requested("Nhà ga T30 Tân Sơn Nhất",null),"Hồ Chí Minh").status()).isNotEqualTo("FOUND");
    }
    @Test void clarifyingTheNameReplacesOldFailedQueryAndKeepsRadiusAndTrip() throws Exception {
        var old=NearbyLocation.requested("nha ga t3 khong",2.);
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"landmark\":\"Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất\"}");
        var result=intents.understand(request("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất",old));
        assertThat(result.analysis().nearby().query()).isEqualTo("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất");
        assertThat(result.analysis().nearby().radiusKm()).isEqualTo(2);
        assertThat(result.analysis().adults()).isEqualTo(2);
        assertThat(result.analysis().children()).isEqualTo(1);
        assertThat(result.analysis().checkIn()).isEqualTo(start);
        assertThat(result.analysis().checkOut()).isEqualTo(start.plusDays(2));
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Hồ Chí Minh\"}");
        assertThat(intents.understand(request("Hồ Chí Minh",old)).analysis().nearby().query()).isEqualTo(old.query());
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"city\":\"Đà Nẵng\"}");
        assertThat(intents.understand(request("Tìm khách sạn ở Đà Nẵng",old)).analysis().nearby()).isNull();
    }
    @Test void nearestEligibleHotelsComeFromCoordinatesNotPreviouslyFocusedRooms() throws Exception {
        classify("ROOM_RECOMMEND","REFINE_SEARCH","{\"landmark\":\"nhà ga T3\"}");
        var hotels=mock(HotelClient.class); var bookings=mock(BookingClient.class);
        var rows=new ArrayList<HotelResponse>();
        // Catalog order deliberately differs from geographic distance; nearest
        // property with insufficient child capacity must not be recommended.
        for(int i : List.of(4,1,3,2,20)) {
            UUID id=UUID.randomUUID(), typeId=UUID.randomUUID();
            var hotel=json.readValue("""
                {"id":"%s","name":"Hotel %d","city":"Hồ Chí Minh","status":"ACTIVE","latitude":%s,"longitude":106.654338}
                """.formatted(id,i,10.8122002+i*.01),HotelResponse.class);
            var type=json.readValue("""
                {"id":"%s","hotelId":"%s","name":"Queen","status":"ACTIVE","basePrice":800000,"maxAdults":2,"maxChildren":%d}
                """.formatted(typeId,id,i==1?0:1),RoomTypeResponse.class);
            rows.add(hotel);
            when(hotels.getRoomTypes(id)).thenReturn(List.of(type));
            when(hotels.getRooms(id)).thenReturn(List.of(new RoomResponse(UUID.randomUUID(),id,typeId,"101",1,"AVAILABLE",null,null)));
        }
        when(hotels.getHotels()).thenReturn(rows);
        when(bookings.getReviewSummary(any())).thenAnswer(c->new ReviewSummaryResponse(c.getArgument(0),0,null,Map.of(),Map.of()));
        when(bookings.getAvailability(any(),any(),any())).thenAnswer(c->new AvailabilityResponse(c.getArgument(0),c.getArgument(1),c.getArgument(2),List.of()));
        var service=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings);
        var jwt=Jwt.withTokenValue("test").header("alg","HS256").subject(UUID.randomUUID().toString()).build();
        var response=service.answer(request("Tôi cần khách sạn gần nhà ga T3",null),jwt);
        assertThat(response.intent()).isEqualTo("RECOMMEND_HOTELS");
        assertThat(response.rooms()).isEmpty();
        assertThat(response.hotels()).extracting(AssistantHotelCard::name).containsExactly("Hotel 2","Hotel 3","Hotel 4");
        assertThat(response.hotels()).allMatch(h->h.distanceKm()>0 && h.distanceKm()<=5 && h.availabilityChecked());
        assertThat(response.answer()).contains("đường chim bay");
        verify(hotels,never()).getRoomTypes(focused);
    }
    @Test void missingCoordinatesAndProviderFailureCannotBecomeInventedNearbyHotels() throws Exception {
        classify("RECOMMEND_HOTELS","NEW_SEARCH","{\"landmark\":\"nhà ga T3\"}");
        var hotels=mock(HotelClient.class); var bookings=mock(BookingClient.class);
        var hotel=json.readValue("{\"id\":\""+UUID.randomUUID()+"\",\"name\":\"Unknown coordinates\",\"status\":\"ACTIVE\"}",HotelResponse.class);
        when(hotels.getHotels()).thenReturn(List.of(hotel));
        var jwt=Jwt.withTokenValue("test").header("alg","HS256").subject(UUID.randomUUID().toString()).build();
        var service=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings);
        var response=service.answer(request("Tìm khách sạn gần nhà ga T3",null),jwt);
        assertThat(response.hotels()).isEmpty();
        assertThat(response.answer()).contains("Chưa có tọa độ");
        verifyNoInteractions(bookings);
        var resolver=mock(LandmarkResolver.class);
        when(resolver.resolve(any(),any())).thenReturn(new LandmarkResolver.Resolution("UNAVAILABLE",List.of()));
        var unavailable=new GroundedAssistantService(intents,new SystemKnowledgeService(),hotels,bookings,resolver)
                .answer(request("Tìm khách sạn gần nhà ga T3",null),jwt);
        assertThat(unavailable.answer()).contains("Chưa truy xuất được dữ liệu vị trí").doesNotContain("không có khách sạn");
        assertThat(unavailable.hotels()).isEmpty();
        assertThat(unavailable.rooms()).isEmpty();
    }
}
