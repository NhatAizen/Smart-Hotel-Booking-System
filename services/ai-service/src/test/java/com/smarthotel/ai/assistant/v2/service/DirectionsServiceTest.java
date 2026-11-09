package com.smarthotel.ai.assistant.v2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import com.smarthotel.ai.integration.booking.BookingClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
import java.time.LocalDate;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DirectionsServiceTest {
    private final HotelClient hotels=mock(HotelClient.class);
    private final BookingClient bookings=mock(BookingClient.class);
    private final LocalSemanticClient semantic=mock(LocalSemanticClient.class);
    private final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    private final LocalDate start=LocalDate.now().plusDays(1);
    private final Jwt jwt=Jwt.withTokenValue("test").header("alg","HS256").subject(UUID.randomUUID().toString()).build();
    private List<HotelResponse> catalog;
    private GroundedAssistantService service;
    @BeforeEach void setup() throws Exception {
        var rows=new ArrayList<HotelResponse>();
        for(String name:List.of("Thanh Binh Garden Residence","Greenway Phu Nhuan Hotel","Gia Định Park Hotel")) rows.add(json.readValue("""
            {"id":"%s","name":"%s","city":"Hồ Chí Minh","address":"18 Hoàng Việt","district":"Tân Bình","status":"ACTIVE","latitude":10.7956,"longitude":106.6588}
            """.formatted(UUID.randomUUID(),name),HotelResponse.class));
        catalog=List.copyOf(rows); when(hotels.getHotels()).thenReturn(catalog);
        plan("{}");
        service=new GroundedAssistantService(new IntentAnalysisService(semantic),new SystemKnowledgeService(),hotels,bookings);
    }
    private void plan(String slots) throws Exception {
        when(semantic.classify(any(AssistantRequest.class))).thenReturn(Optional.of(json.readValue("{\"intent\":\"DIRECTIONS\",\"action\":\"NONE\",\"slots\":"+slots+"}",SemanticDecision.class)));
    }
    private AssistantConversationContext state(NearbyLocation nearby,AssistantRouteContext route) {
        var trip=new AssistantQueryContext(null,null,null,start,start.plusDays(2),2,1,List.of(),true,null,nearby);
        var ids=catalog.stream().map(HotelResponse::id).toList();
        return new AssistantConversationContext(List.of(),ids,trip,route==null?"RECOMMEND_HOTELS":"DIRECTIONS",List.of(),null,null,ids,ids,route);
    }
    private AssistantResponse ask(String question,AssistantConversationContext state) {
        return service.answer(new AssistantRequest(question,start,start.plusDays(2),2,1,null,List.of(),state),jwt);
    }
    @Test void ambiguousHotelAsksWhichOneAndKeepsVerifiedT3WithoutAskingForCityAgain() throws Exception {
        plan("{\"origin\":\"nhà ga T3\"}");
        // No city hint, and malicious client coordinates must not become the origin.
        var answer=ask("Cho tôi xem địa chỉ từ nhà ga T3 đến khách sạn đó đi",state(new NearbyLocation("nhà ga T3",5.,"fake",1.,1.,"https://bad.invalid"),null));
        assertThat(answer.intent()).isEqualTo("DIRECTIONS");
        assertThat(answer.directions().hotelChoiceRequired()).isTrue();
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.answer()).contains("Bạn muốn đi đến khách sạn nào").doesNotContain("tỉnh/thành");
        assertThat(answer.directions().destinations()).hasSize(3);
        for(var destination:answer.directions().destinations()) {
            String url=URLDecoder.decode(destination.mapsUrl(),StandardCharsets.UTF_8);
            assertThat(url).isEqualTo("https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=10.8122002,106.654338;10.7956,106.6588");
            assertThat(destination.address()).contains("18 Hoàng Việt");
        }
        assertThat(answer.context().adults()).isEqualTo(2);
        assertThat(answer.context().children()).isEqualTo(1);
        assertThat(answer.context().checkOut()).isEqualTo(start.plusDays(2));
        assertThat(answer.hotels()).isEmpty(); assertThat(answer.rooms()).isEmpty();
        verifyNoInteractions(bookings);
    }
    @Test void ordinalAndShortNameUseTheOriginalDisplayedRoster() {
        var ids=catalog.stream().map(HotelResponse::id).toList();
        var state=state(NearbyLocation.requested("nhà ga T3",null),new AssistantRouteContext("nhà ga T3",ids,true,true));
        var second=ask("Khách sạn thứ hai",state);
        assertThat(second.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(ids.get(1));
        assertThat(second.directions().hotelChoiceRequired()).isFalse();
        var named=ask("Greenway",state);
        assertThat(named.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(ids.get(1));
        var invalid=ask("Khách sạn thứ 9",state);
        assertThat(invalid.directions().hotelChoiceRequired()).isTrue();
        assertThat(invalid.answer()).contains("Số thứ tự đó không có");
    }
    @Test void selectedHotelPersistsButChangingOrdinalStillReadsOriginalSearchOrder() {
        var ids=catalog.stream().map(HotelResponse::id).toList();
        var memory=state(NearbyLocation.requested("nhà ga T3",null),new AssistantRouteContext("nhà ga T3",List.of(ids.get(1)),true,false));
        assertThat(ask("Chỉ đường tới khách sạn đó",memory).directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(ids.get(1));
        assertThat(ask("Cái thứ ba",memory).directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(ids.get(2));
    }
    @Test void missingOriginAsksForOriginThenContinuesWithTheSameDestination() throws Exception {
        var id=catalog.get(1).id();
        var memory=state(null,new AssistantRouteContext(null,List.of(id),false,false));
        var unknown=ask("Chỉ đường đến Greenway",memory);
        assertThat(unknown.directions().originRequired()).isTrue();
        assertThat(unknown.answer()).contains("Bạn muốn xuất phát từ đâu");
        assertThat(unknown.directions().destinations()).allMatch(d->d.mapsUrl()==null);
        plan("{\"origin\":\"Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất\"}");
        var resolved=ask("Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất",memory);
        assertThat(resolved.directions().originRequired()).isFalse();
        assertThat(resolved.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(id);
    }
    @Test void aMissingHotelDoesNotShiftTheOrdinalToAnotherHotel() {
        var memory=state(NearbyLocation.requested("nhà ga T3",null),null);
        when(hotels.getHotels()).thenReturn(catalog.subList(1,3));
        var second=ask("Chỉ đường đến khách sạn thứ hai",memory);
        assertThat(second.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(catalog.get(1).id());
        var first=ask("Chỉ đường đến khách sạn đầu tiên",memory);
        assertThat(first.directions().hotelChoiceRequired()).isTrue();
        assertThat(first.answer()).contains("Số thứ tự đó không có");
    }
    @Test void theHotelNamedAtTheOriginCannotBeConfusedWithTheDestination() {
        var memory=state(NearbyLocation.requested("nhà ga T3",null),null);
        var answer=ask("Cho tôi xem đường đi từ Greenway Phu Nhuan Hotel đến Gia Định Park Hotel",memory);
        assertThat(answer.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(catalog.get(2).id());
    }
    @Test void missingHotelCannotInventAConfirmedOriginOrDestination() {
        when(hotels.getHotels()).thenReturn(List.of());
        var answer=ask("Chỉ đường từ nhà ga T3 đến khách sạn đó",state(NearbyLocation.requested("nhà ga T3",null),null));
        assertThat(answer.directions().destinations()).isEmpty();
        assertThat(answer.directions().originRequired()).isTrue();
        assertThat(answer.directions().hotelChoiceRequired()).isTrue();
        assertThat(answer.answer()).contains("khách sạn nào");
    }
    @Test void anAddressWithoutCoordinatesCannotInventAnOsmRoute() throws Exception {
        var record=json.valueToTree(catalog.get(0));
        ((com.fasterxml.jackson.databind.node.ObjectNode)record).putNull("latitude").putNull("longitude");
        when(hotels.getHotels()).thenReturn(List.of(json.treeToValue(record,HotelResponse.class)));
        var answer=ask("Chỉ đường đến khách sạn đầu tiên",state(NearbyLocation.requested("nhà ga T3",null),null));
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.directions().destinations()).hasSize(1).allSatisfy(d->{
            assertThat(d.address()).contains("18 Hoàng Việt");
            assertThat(d.mapsUrl()).isNull();
        });
        assertThat(answer.answer()).contains("chưa có tọa độ").doesNotContain("ở nút bên dưới");
    }
    @Test void hotelToLandmarkResolvesBothRolesAndDoesNotReadFromAsFour() {
        var answer=ask("cho tôi địa chỉ từ khách sạn Gia Định Park Hotel đến nhà ga T3 xem thử",state(NearbyLocation.requested("nhà ga T3",null),null));
        assertThat(answer.directions().hotelAtOrigin()).isTrue();
        assertThat(answer.directions().hotelChoiceRequired()).isFalse();
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.directions().destinations()).singleElement().satisfies(d->{
            assertThat(d.hotelId()).isEqualTo(catalog.get(2).id());
            assertThat(URLDecoder.decode(d.mapsUrl(),StandardCharsets.UTF_8)).endsWith("route=10.7956,106.6588;10.8122002,106.654338");
        });
        assertThat(answer.answer()).contains("từ Gia Định Park Hotel đến Nhà ga T3").doesNotContain("Số thứ tự");
    }
    @Test void aBareHotelChoiceRetainsTheLandmarkAndReverseDirection() throws Exception {
        plan("{\"origin\":\"3\"}");
        var ids=catalog.stream().map(HotelResponse::id).toList();
        var memory=state(NearbyLocation.requested("nhà ga T3",null),new AssistantRouteContext("nhà ga T3",List.of(ids.get(0)),true,false,true));
        var answer=ask("3",memory);
        assertThat(answer.directions().hotelAtOrigin()).isTrue();
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.directions().destinations()).singleElement().satisfies(d->{
            assertThat(d.hotelId()).isEqualTo(ids.get(2));
            assertThat(URLDecoder.decode(d.mapsUrl(),StandardCharsets.UTF_8)).endsWith("route=10.7956,106.6588;10.8122002,106.654338");
        });
        assertThat(answer.directions().landmark().query()).isEqualTo("nhà ga T3");
    }
    @Test void anExplicitNewOriginReversesThePreviousRouteWithoutRepeatingTheHotel() {
        var ids=catalog.stream().map(HotelResponse::id).toList();
        var memory=state(NearbyLocation.requested("nhà ga T3",null),new AssistantRouteContext("nhà ga T3",List.of(ids.get(2)),true,false,true));
        var answer=ask("Xuất phát từ nhà ga T1 đến đó",memory);
        assertThat(answer.directions().hotelAtOrigin()).isFalse();
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.directions().destinations()).singleElement().satisfies(d->{
            assertThat(d.hotelId()).isEqualTo(ids.get(2));
            assertThat(URLDecoder.decode(d.mapsUrl(),StandardCharsets.UTF_8)).endsWith("route=10.8137889,106.6620986;10.7956,106.6588");
        });
    }
    @Test void hotelNamesAndAddressesCannotBecomeOrdinalsOrOriginQueries() throws Exception {
        plan("{\"origin\":\"Gia Định Park Hotel 18 Phan Văn Trị, Quận 3\"}");
        var ids=catalog.stream().map(HotelResponse::id).toList();
        var answer=ask("Gia Định Park Hotel 18 Phan Văn Trị, Quận 3",state(NearbyLocation.requested("nhà ga T3",null),new AssistantRouteContext("nhà ga T3",ids,true,true,true)));
        assertThat(answer.directions().hotelAtOrigin()).isTrue();
        assertThat(answer.directions().originRequired()).isFalse();
        assertThat(answer.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(ids.get(2));
        assertThat(answer.directions().landmark().query()).isEqualTo("nhà ga T3");
    }
    @Test void coordinateLookupOverridesComparisonAndReadsTheRequestedLandmark() throws Exception {
        when(semantic.classify(any(AssistantRequest.class))).thenReturn(Optional.of(json.readValue("{\"intent\":\"COMPARE_HOTELS\",\"action\":\"NONE\",\"slots\":{}}",SemanticDecision.class)));
        var answer=ask("Cho tôi tọa độ của khách sạn số 3 với Nhà ga T1 đi",state(NearbyLocation.requested("nhà ga T3",null),null));
        assertThat(answer.intent()).isEqualTo("DIRECTIONS");
        assertThat(answer.directions().coordinatesOnly()).isTrue();
        assertThat(answer.directions().destinations()).extracting(AssistantDirections.Destination::hotelId).containsExactly(catalog.get(2).id());
        assertThat(answer.answer()).contains("Gia Định Park Hotel: vĩ độ 10.7956, kinh độ 106.6588","Nhà ga T1 sân bay Tân Sơn Nhất: vĩ độ 10.8137889, kinh độ 106.6620986").doesNotContain("so sánh","ước tính");
    }
    @Test void aNameReplyRecoversTheCoordinateGoalFromAnOlderMisclassifiedTurn() throws Exception {
        when(semantic.classify(any(AssistantRequest.class))).thenReturn(Optional.of(json.readValue("{\"intent\":\"COMPARE_HOTELS\",\"action\":\"NONE\",\"slots\":{}}",SemanticDecision.class)));
        var previous=state(NearbyLocation.requested("nhà ga T1",null),null);
        var broken=new AssistantConversationContext(List.of(),previous.hotelIds(),previous.lastHotelSearch(),"COMPARE_HOTELS",List.of(),null,null,previous.hotelIds(),previous.hotelIds());
        var answer=service.answer(new AssistantRequest("Gia Định Park Hotel khách sạn này",start,start.plusDays(2),2,1,null,List.of(new AssistantMessage("user","Cho tôi tọa độ khách sạn số 3 với Nhà ga T1 đi")),broken),jwt);
        assertThat(answer.directions().coordinatesOnly()).isTrue();
        assertThat(answer.answer()).contains("Gia Định Park Hotel: vĩ độ","Nhà ga T1").doesNotContain("so sánh");
    }
    @Test void aNewPropertyQuestionEndsTheCoordinateLookup() {
        var old=state(NearbyLocation.requested("nhà ga T1",null),new AssistantRouteContext("nhà ga T1",List.of(catalog.get(2).id()),true,false,false,true));
        for(String text:List.of("Gia Định Park Hotel số điện thoại là gì?","Chất lượng khách sạn đó thế nào?","Chỉ đường đến khách sạn đó"))
            assertThat(GeographicQuery.coordinates(new AssistantRequest(text,start,start.plusDays(1),2,1,null,List.of(),old))).as(text).isFalse();
    }
}
