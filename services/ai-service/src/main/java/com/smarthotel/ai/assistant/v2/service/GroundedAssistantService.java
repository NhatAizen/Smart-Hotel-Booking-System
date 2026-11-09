package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.AssistantBookingCard;
import com.smarthotel.ai.assistant.v2.dto.AssistantHotelCard;
import com.smarthotel.ai.assistant.v2.dto.AssistantQueryContext;
import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.smarthotel.ai.assistant.v2.dto.AssistantResponse;
import com.smarthotel.ai.assistant.v2.dto.AssistantEngine;
import com.smarthotel.ai.assistant.v2.dto.SemanticDecision;
import com.smarthotel.ai.assistant.v2.dto.IntentAnalysis;
import com.smarthotel.ai.assistant.v2.dto.NearbyLocation;
import com.smarthotel.ai.integration.booking.BookingClient;
import com.smarthotel.ai.integration.booking.dto.AvailabilityResponse;
import com.smarthotel.ai.integration.booking.dto.BookingResponse;
import com.smarthotel.ai.integration.booking.dto.ReviewResponse;
import com.smarthotel.ai.integration.booking.dto.ReviewSummaryResponse;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import com.smarthotel.ai.integration.hotel.dto.HotelWithRoomTypes;
import com.smarthotel.ai.integration.hotel.dto.RoomResponse;
import com.smarthotel.ai.integration.hotel.dto.RoomTypeResponse;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class GroundedAssistantService {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(GroundedAssistantService.class);

    private final IntentAnalysisService intentAnalysisService;
    private final SystemKnowledgeService knowledge;
    private final HotelClient hotelClient;
    private final BookingClient bookingClient;
    private final LandmarkResolver landmarks;


    public GroundedAssistantService(IntentAnalysisService intents, SystemKnowledgeService knowledge, HotelClient hotels, BookingClient bookings) {
        this(intents, knowledge, hotels, bookings, new LandmarkResolver());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public GroundedAssistantService(
            IntentAnalysisService intentAnalysisService,
            SystemKnowledgeService knowledge,
            HotelClient hotelClient,
            BookingClient bookingClient,
            LandmarkResolver landmarks
    ) {
        this.intentAnalysisService = intentAnalysisService;
        this.knowledge = knowledge;
        this.hotelClient = hotelClient;
        this.bookingClient = bookingClient;
        this.landmarks = landmarks;
    }

    public AssistantResponse answer(AssistantRequest request, Jwt jwt) {
        long started = System.nanoTime();
        AssistantRequest resolved = resolveConversationReference(request);
        IntentAnalysisService.Understanding understanding = intentAnalysisService.understand(resolved);
        long planned = System.nanoTime();
        try {
        if(understanding.planningUnavailable()) return response(understanding.analysis(),
                "Tôi chưa phân tích được đầy đủ yêu cầu lúc này. Bạn thử lại giúp tôi nhé.",List.of(),List.of(),List.of()).withAction("NONE");
        if (!AssistantContract.accepts(understanding.analysis().intent(), understanding.action())) {
            return response(understanding.analysis(), "Tôi chưa xác định chắc yêu cầu này. Bạn muốn tìm phòng, so sánh, xem đơn đặt hay hỏi cách sử dụng EnziuRooms?", List.of(), List.of(), List.of()).withAction("NONE");
        }
        AssistantResponse result = answerGrounded(resolved, jwt, understanding).withAction(understanding.action());
        return understanding.semantic() == null ? result : result.withEngine(AssistantEngine.semantic(SystemKnowledgeService.MODEL, understanding.semantic().model()));
        } finally {
            long ended = System.nanoTime();
            // Phase durations only: no user text, tokens, booking IDs or hotel data.
            LOG.info("assistant_timing planMs={} dataMs={} totalMs={}", (planned-started)/1_000_000,
                    (ended-planned)/1_000_000, (ended-started)/1_000_000);
        }
    }

    private AssistantRequest resolveConversationReference(AssistantRequest request) {
        var state = request.conversationContext();
        String question = normalize(request.message());
        if (request.hotelId() != null || state == null
                || knowledge.proceduralTopic(request.message()).isPresent()) return request;
        if ("DIRECTIONS".equals(state.lastIntent()) && state.lastDirections()!=null && !state.lastDirections().hotelChoiceRequired()
                && state.lastDirections().destinationIds()!=null && state.lastDirections().destinationIds().size()==1) {
            return new AssistantRequest(request.message(),request.checkIn(),request.checkOut(),request.adults(),request.children(),
                    state.lastDirections().destinationIds().get(0),request.history(),state);
        }
        if (List.of("ROOM_RECOMMEND", "ROOM_COMPARE").contains(Objects.toString(state.lastIntent(),"")) && state.roomHotelId()!=null) {
            return new AssistantRequest(request.message(),request.checkIn(),request.checkOut(),request.adults(),request.children(),
                    state.roomHotelId(),request.history(),state);
        }
        if (state.hotelIds()==null || state.hotelIds().isEmpty()) return request;
        // A single displayed search result is the unambiguous current subject.
        // This survives shortened text history and does not depend on a pronoun spelling.
        if ("RECOMMEND_HOTELS".equals(state.lastIntent()) && state.hotelIds().size()==1) {
            return new AssistantRequest(request.message(),request.checkIn(),request.checkOut(),request.adults(),request.children(),
                    state.hotelIds().get(0),request.history(),state);
        }
        if (request.history() == null || request.history().isEmpty()
                || !question.matches(".*\\b(phong|khach san|hotels?|rooms?)\\b.*")
                || !question.matches(".*\\b(do|nay|vua|that|this)\\b.*")) return request;
        try {
            var catalog = hotelClient.getHotels().stream().filter(h -> state.hotelIds().contains(h.id()))
                    .filter(h -> h.name() != null && !h.name().isBlank()).toList();
            for (int index=request.history().size()-1; index>=0; index--) {
                var message=request.history().get(index);
                if (message==null || !"assistant".equals(message.role()) || message.content()==null) continue;
                var mentioned=catalog.stream().filter(h -> normalize(message.content()).contains(normalize(h.name()))).toList();
                if (mentioned.size()>1) return request; // A group is not a unique referent.
                if (mentioned.size()==1) {
                    // Prior text identifies only the hotel. All facts, availability
                    // and room constraints are read again from trusted services.
                    return new AssistantRequest(request.message(),request.checkIn(),request.checkOut(),request.adults(),request.children(),
                            mentioned.get(0).id(),request.history(),state);
                }
            }
        } catch (org.springframework.web.client.RestClientException unavailable) {
            // An unresolved reference must never become a guessed hotel.
        }
        return request;
    }

    private AssistantResponse answerGrounded(AssistantRequest request, Jwt jwt, IntentAnalysisService.Understanding understanding) {
        UUID customerId = currentUserId(jwt);
        IntentAnalysis analysis = understanding.analysis();
        var semanticSlots = understanding.semantic() == null ? null : understanding.semantic().slots();
        if (semanticSlots != null && semanticSlots.radiusKm() != null && analysis.nearby() == null)
            return response(analysis, "Bạn muốn tính bán kính từ địa điểm nào?", List.of(), List.of(), List.of());
        if (semanticSlots != null && List.of("RECOMMEND_HOTELS", "ROOM_RECOMMEND", "ROOM_COMPARE", "COMPARE_HOTELS").contains(analysis.intent())) {
            if (semanticSlots.unsupportedConstraints() != null && !semanticSlots.unsupportedConstraints().isEmpty())
                return response(analysis, "Tôi chưa có bộ lọc và dữ liệu đã kiểm chứng cho tiêu chí: "
                        + semanticSlots.unsupportedConstraints().stream().filter(Objects::nonNull).map(item -> item.substring(0, Math.min(80,item.length()))).limit(3).collect(Collectors.joining(", "))
                        + ". Bạn muốn tôi tìm theo khu vực, ngân sách, sức chứa và tiện nghi đã công bố không?", List.of(), List.of(), List.of());
            if ("TOTAL".equals(semanticSlots.budgetScope()) && (analysis.checkIn() == null || analysis.checkOut() == null))
                return response(analysis, "Ngân sách này dành cho cả chuyến đi. Bạn cho tôi ngày nhận và trả phòng để tính giới hạn mỗi đêm nhé.", List.of(), List.of(), List.of());
        }
        String clarification = DialoguePolicy.clarification(request, analysis, understanding.action());
        if (clarification != null) return response(analysis, clarification, List.of(), List.of(), List.of());
        if (List.of("RECOMMEND_HOTELS", "COMPARE_HOTELS", "HOTEL_DETAILS", "ROOM_RECOMMEND", "ROOM_COMPARE").contains(analysis.intent())) {
            if ((analysis.checkIn() == null) != (analysis.checkOut() == null)) {
                return response(analysis, "Bạn hãy cung cấp cả ngày nhận phòng và ngày trả phòng để kiểm tra phòng trống.", List.of(), List.of(), List.of());
            }
            validateTripDates(analysis);
        }

        try {
            return switch (analysis.intent()) {
                case "MY_BOOKINGS" -> answerMyBookings(request, analysis, customerId, jwt.getTokenValue());
                case "REVIEW_SUMMARY" -> answerReviewSummary(request, analysis);
                case "COMPARE_HOTELS" -> answerHotelSearch(request, analysis, true, understanding.action());
                case "RECOMMEND_HOTELS" -> answerHotelSearch(request, alternativeSearchContext(request, analysis, understanding.action()), false, understanding.action());
                case "HOTEL_DETAILS" -> answerHotelDetails(resolveHotelReference(request, understanding.action()), analysis);
                case "DIRECTIONS" -> answerDirections(request,analysis);
                case "ROOM_RECOMMEND", "ROOM_COMPARE" -> {
                    boolean selectingHotel="SELECT_OPTION".equals(understanding.action())
                            && normalize(request.message()).matches(".*\\b(khach san|ks|hotels?)\\s+(?:(?:so|thu)\\s+)?(?:\\d+|nhat|hai|ba|bon|tu|nam)\\b.*");
                    yield answerRooms(selectingHotel?resolveHotelReference(request,understanding.action()):request,analysis,understanding.semantic(),selectingHotel?"NONE":understanding.action());
                }
                default -> answerGeneral(request, analysis, understanding.semantic());
            };
        } catch (org.springframework.web.client.RestClientException unavailable) {
            return response(analysis, "Chưa truy xuất được dữ liệu hiện tại. Bạn vui lòng thử lại sau; tôi chưa thể xác nhận thông tin này.", List.of(), List.of(), List.of());
        }
    }

    private AssistantRequest resolveHotelReference(AssistantRequest request, String action) {
        if (!"SELECT_OPTION".equals(action)) return request;
        int index = DialoguePolicy.ordinal(request.message());
        var state = request.conversationContext();
        var ids = state == null || state.hotelIds() == null ? List.<UUID>of() : state.hotelIds();
        // Never guess the first hotel when an ordinal cannot be resolved.
        UUID id = index >= 0 && index < ids.size() ? ids.get(index) : null;
        return new AssistantRequest(request.message(), request.checkIn(), request.checkOut(), request.adults(), request.children(), id, List.of(), state);
    }

    private AssistantResponse answerDirections(AssistantRequest request,IntentAnalysis analysis) {
        var reply=new DirectionsService(hotelClient,landmarks).answer(request,analysis);
        return response(analysis,reply.answer(),List.of(),List.of(),reply.suggestions()).withDirections(reply.directions());
    }

    private AssistantResponse answerHotelSearch(
            AssistantRequest request,
            IntentAnalysis analysis,
            boolean compare,
            String action
    ) {
        if (!compare && analysis.nearby() != null) return answerNearbyHotels(request, analysis, action);
        if (!compare && analysis.city() == null) {
            return response(analysis, "Bạn đi " + guestDescription(analysis)
                    + ". Bạn muốn ở tỉnh/thành nào? Tôi sẽ tìm khách sạn và loại phòng đủ chỗ cho bạn.",
                    List.of(), List.of(), List.of("Tìm tại Hồ Chí Minh", "Tìm tại Vũng Tàu", "Tìm tại Nha Trang"));
        }
        List<UUID> comparisonIds = compare ? comparisonIds(request) : List.of();
        List<HotelWithRoomTypes> hotels = comparisonIds.isEmpty() ? hotelClient.getHotelsWithRoomTypes()
                : hotelClient.getHotelsWithRoomTypes(comparisonIds);
        if (hotels.isEmpty()) {
            return response(
                    analysis,
                    "Hiện EnziuRooms chưa có khách sạn đang hoạt động để mình tư vấn.",
                    List.of(),
                    List.of(),
                    List.of("Xem khách sạn đang mở bán")
            );
        }

        List<HotelWithRoomTypes> regional = compare ? hotels : hotels.stream()
                .filter(item -> matchesLocation(item.hotel(), analysis.city()))
                .toList();
        if (regional.isEmpty()) {
            return response(analysis, "Hiện chưa có khách sạn đang hoạt động khớp khu vực " + known(analysis.city())
                    + " trong danh mục. Bạn muốn tìm ở khu vực khác không?", List.of(), List.of(), List.of());
        }
        List<ScoredHotel> scored = regional.stream()
                .map(item -> scoreHotel(item, analysis))
                .sorted(Comparator.comparingDouble(ScoredHotel::score).reversed())
                .toList();

        List<ScoredHotel> selected;
        if (compare) {
            List<Integer> positions = OptionReferences.positions(request.message());
            var state=request.conversationContext();
            List<UUID> active=state==null||state.hotelIds()==null?List.of():state.hotelIds();
            List<UUID> recommended=state==null||state.recommendedHotelIds()==null||state.recommendedHotelIds().isEmpty()?active:state.recommendedHotelIds();
            List<UUID> roster=OptionReferences.wholeRoster(request.message())||OptionReferences.explicitPositions(request.message())
                    || OptionReferences.hasCount(request.message()) && positions.size()>active.size()?recommended:active;
            if(positions.isEmpty() && OptionReferences.wholeRoster(request.message())) positions=java.util.stream.IntStream.range(0,roster.size()).boxed().toList();
            if (!positions.isEmpty()) {
                List<UUID> requested = OptionReferences.resolve(positions, roster);
                selected = requested.stream().flatMap(id -> scored.stream().filter(item -> id.equals(item.card().hotelId()))).toList();
                if (requested.size() < 2 || selected.size() != requested.size()) {
                    return response(analysis, "Tôi chưa xác định được đủ khách sạn bạn chọn trong danh sách vừa hiển thị. Bạn cho biết tên hai khách sạn trở lên hoặc các số thứ tự khác nhau trong danh sách nhé.", List.of(), List.of(), List.of());
                }
            } else {
                String comparisonMessage = request.message();
                boolean namesMentioned = hotels.stream().anyMatch(item -> normalize(request.message()).contains(normalize(item.hotel().name())));
                if (!namesMentioned && request.history() != null) {
                    comparisonMessage += request.history().stream().filter(message -> "assistant".equals(message.role()))
                            .reduce((first, second) -> second).map(message -> " " + message.content()).orElse("");
                }
                selected = selectHotelsForComparison(scored, analysis, comparisonMessage);
                if (!namesMentioned && request.conversationContext() != null && request.conversationContext().hotelIds() != null
                        && request.conversationContext().hotelIds().size() >= 2) {
                    List<UUID> references = request.conversationContext().hotelIds();
                    selected = references.stream()
                            .flatMap(id -> scored.stream().filter(item -> id.equals(item.card().hotelId()))).toList();
                }
            }
            if (selected.size() < 2) {
                return response(analysis, "Bạn muốn so sánh hai khách sạn nào? Hãy cho biết tên hai khách sạn trên EnziuRooms.", List.of(), List.of(), List.of());
            }
        } else {
            List<ScoredHotel> exact = scored.stream().filter(ScoredHotel::exactMatch).limit(3).toList();
            Set<UUID> shown = "MORE_HOTELS".equals(action) ? shownHotelIds(request) : Set.of();
            selected = exact;
            if (!shown.isEmpty()) {
                selected = scored.stream().filter(ScoredHotel::exactMatch)
                        .filter(item -> !shown.contains(item.card().hotelId())).limit(3).toList();
                if (selected.isEmpty() && scored.stream().anyMatch(ScoredHotel::exactMatch)) {
                    return response(analysis, "Tôi đã giới thiệu hết các khách sạn phù hợp với tiêu chí hiện tại tại "
                            + known(analysis.city()) + ". Bạn muốn đổi khu vực, ngân sách hoặc ngày ở không?", List.of(), List.of(), List.of());
                }
            }
            if (selected.isEmpty()) {
                return response(analysis, explainNoMatch(regional, analysis), List.of(), List.of(), List.of());
            }
        }

        List<AssistantHotelCard> cards = selected.stream()
                .map(ScoredHotel::card)
                .toList();

        if(compare) {
            if ("CHOOSE_OPTION".equals(action)) {
                return response(analysis, HotelChoicePresenter.answer(cards, analysis), List.of(), List.of(), List.of());
            }
            var comparison=HotelComparisonPresenter.build(request.message(),cards);
            String lead=("QUALITY".equals(comparison.focus())?"So sánh chất lượng ":"So sánh ")+cards.size()+" khách sạn: "+cards.stream().map(AssistantHotelCard::name).collect(Collectors.joining("; "))+". Chuyến đi giữ "+guestDescription(analysis)+".";
            return response(analysis,lead,cards,List.of(),List.of("So sánh chất lượng","So sánh giá","Khách sạn nào có tiện nghi phù hợp gia đình?")).withComparison(comparison);
        }

        String answer = (compare ? "So sánh theo dữ liệu hiện tại:\n" : "MORE_HOTELS".equals(action) ? "Các khách sạn khác phù hợp với chuyến đi của bạn:\n" : "Cho " + guestDescription(analysis) + ", tôi gợi ý:\n")
                + cards.stream().map(card -> cards.size() == 1 ? describeHotel(card)
                : "• " + card.name() + ": " + money(card.pricePerNight()) + "/phòng/đêm.").collect(Collectors.joining("\n"));
        if (cards.stream().anyMatch(card -> !card.exactMatch())) {
            answer += "\nMột số lựa chọn chưa khớp đầy đủ tiêu chí; xem thông tin từng khách sạn.";
        }
        if (!validDateRange(analysis.checkIn(), analysis.checkOut())) {
            answer += "\nChưa kiểm tra phòng trống. Chọn ngày ở để xác nhận. Giá cơ bản; giá cuối cùng xem khi đặt.";
        } else {
            answer += "\nPhòng trống đã kiểm tra theo ngày đã chọn. Giá cơ bản; giá cuối cùng xem khi đặt.";
        }

        return response(
                analysis,
                answer,
                cards,
                List.of(),
                compare
                        ? List.of("Tìm khách sạn rẻ hơn", "Khách sạn nào phù hợp gia đình?", "Tóm tắt đánh giá khách sạn đầu tiên")
                        : List.of("Ưu tiên khách sạn có review tốt", "Tìm khách sạn có hồ bơi")
        );
    }

    private AssistantResponse answerNearbyHotels(AssistantRequest request, IntentAnalysis analysis, String action) {
        String hint = analysis.city();
        if (hint == null && request.hotelId() != null) {
            HotelResponse focused = safeHotel(request.hotelId());
            if (focused != null) hint = focused.city();
        }
        var resolved = landmarks.resolve(analysis.nearby(), hint);
        if (!"FOUND".equals(resolved.status())) {
            String answer = switch (resolved.status()) {
                case "AMBIGUOUS" -> (hint==null || hint.isBlank() ? "Bạn muốn tìm gần " + analysis.nearby().query()+" ở tỉnh/thành nào?"
                        : "Tôi đang giữ khu vực "+hint+". Bạn cho biết tên đầy đủ, sân bay/cơ sở hoặc địa chỉ của "+analysis.nearby().query()+" nhé.")
                        + (resolved.choices().isEmpty() ? " Hãy cho tôi tên địa điểm cụ thể hoặc địa chỉ."
                        : " Tôi thấy: " + resolved.choices().stream().limit(3).map(NearbyLocation::displayName).collect(Collectors.joining("; ")) + ".");
                case "UNKNOWN" -> "Tôi chưa xác định chắc vị trí của " + analysis.nearby().query()+(hint==null || hint.isBlank()?"":" tại "+hint)
                        + ". Bạn cho tôi tên đầy đủ hoặc địa chỉ nhé.";
                default -> "Chưa truy xuất được dữ liệu vị trí của " + analysis.nearby().query() + ". Tôi chưa thể xác nhận khách sạn nào ở gần; bạn có thể cho biết địa chỉ hoặc thử lại.";
            };
            return response(analysis, answer, List.of(), List.of(), List.of());
        }
        NearbyLocation point = resolved.choices().get(0);
        IntentAnalysis located = analysis.withNearby(point);
        var catalog = hotelClient.getHotels().stream().filter(h -> h.id() != null && isActive(h.status())).toList();
        var mapped = catalog.stream().filter(h -> LandmarkResolver.valid(h.latitude(), h.longitude())).toList();
        if (mapped.isEmpty()) return response(located, "Chưa có tọa độ khách sạn đủ tin cậy để tìm theo khoảng cách tới " + point.displayName() + ".", List.of(), List.of(), List.of());
        var within = mapped.stream().filter(h -> LandmarkResolver.distance(point.latitude(), point.longitude(), h.latitude(), h.longitude()) <= point.radiusKm())
                .sorted(Comparator.comparingDouble(h -> LandmarkResolver.distance(point.latitude(), point.longitude(), h.latitude(), h.longitude()))).toList();
        Set<UUID> shown = "MORE_HOTELS".equals(action) && request.conversationContext() != null && request.conversationContext().shownHotelIds() != null
                ? Set.copyOf(request.conversationContext().shownHotelIds()) : Set.of();
        var cards = new ArrayList<AssistantHotelCard>();
        boolean suitableSeen = false;
        for (HotelResponse hotel : within) {
            var scored = scoreHotel(new HotelWithRoomTypes(hotel, hotelClient.getRoomTypes(hotel.id())), located.withCity(null));
            if (!scored.exactMatch()) continue;
            suitableSeen = true;
            if (shown.contains(hotel.id())) continue;
            cards.add(scored.card().withDistance(LandmarkResolver.distance(point.latitude(), point.longitude(), hotel.latitude(), hotel.longitude()), point.displayName()));
            if (cards.size() == 3) break;
        }
        String area = "trong bán kính " + String.format(Locale.forLanguageTag("vi-VN"), "%.1f", point.radiusKm()) + " km quanh " + point.displayName() + " (đường chim bay)";
        String answer;
        if (cards.isEmpty()) answer = suitableSeen ? "Tôi đã giới thiệu hết các khách sạn phù hợp " + area + ". Bạn muốn tăng bán kính không?"
                : within.isEmpty() ? "Chưa tìm thấy khách sạn có tọa độ xác nhận " + area + ". Bạn muốn tăng bán kính không?"
                : "Chưa có phòng đáp ứng sức chứa, ngày ở và các tiêu chí của bạn " + area + ". Bạn muốn nới bán kính hoặc tiêu chí không?";
        else answer = "Tôi tìm được " + cards.size() + " khách sạn phù hợp " + area + ", xếp gần trước: "
                + cards.stream().map(c -> c.name() + " — " + String.format(Locale.forLanguageTag("vi-VN"), "%.1f km", c.distanceKm())).collect(Collectors.joining("; "))
                + ". " + (validDateRange(analysis.checkIn(), analysis.checkOut()) ? "Phòng trống đã kiểm tra theo ngày đã chọn." : "Chưa kiểm tra phòng trống; hãy chọn ngày ở.");
        return response(located, answer, List.copyOf(cards), List.of(), List.of());
    }

    private List<UUID> comparisonIds(AssistantRequest request) {
        var state = request.conversationContext();
        if (state == null || state.hotelIds() == null || state.hotelIds().isEmpty()) return List.of();
        // Resolve explicit names against the light catalog before loading room types,
        // inventory and reviews; an unrelated hotel's outage cannot break this pair.
        var named = hotelClient.getHotels().stream().filter(h -> h.name() != null
                && normalize(request.message()).contains(normalize(h.name()))).map(HotelResponse::id).toList();
        if (!named.isEmpty()) return named;
        var active = state.hotelIds();
        var recommended = state.recommendedHotelIds() == null || state.recommendedHotelIds().isEmpty() ? active : state.recommendedHotelIds();
        var positions = OptionReferences.positions(request.message());
        var roster = OptionReferences.wholeRoster(request.message()) || OptionReferences.explicitPositions(request.message())
                || OptionReferences.hasCount(request.message()) && positions.size() > active.size() ? recommended : active;
        if (positions.isEmpty()) return roster;
        return OptionReferences.resolve(positions, roster);
    }

    private Set<UUID> shownHotelIds(AssistantRequest request) {
        Set<UUID> ids = new LinkedHashSet<>();
        if (request.conversationContext() != null && request.conversationContext().shownHotelIds() != null) {
            request.conversationContext().shownHotelIds().stream().filter(Objects::nonNull).forEach(ids::add);
        }
        if (request.hotelId() != null) ids.add(request.hotelId());
        return ids;
    }

    private IntentAnalysis alternativeSearchContext(AssistantRequest request, IntentAnalysis analysis, String action) {
        if (analysis.nearby() != null || !"MORE_HOTELS".equals(action) || analysis.city() != null || request.hotelId() == null) return analysis;
        HotelResponse hotel = safeHotel(request.hotelId());
        if (hotel == null) return analysis;
        return new IntentAnalysis(analysis.intent(), hotel.city(), analysis.maxBudgetPerNight(), analysis.starRating(),
                analysis.adults(), analysis.children(), analysis.checkIn(), analysis.checkOut(), analysis.amenities(), analysis.hotelNames(), analysis.bookingCode(), analysis.roomCriteria());
    }

    private AssistantResponse answerReviewSummary(AssistantRequest request, IntentAnalysis analysis) {
        List<HotelWithRoomTypes> hotels = hotelClient.getHotelsWithRoomTypes();
        HotelWithRoomTypes selected = resolveRequestedHotel(hotels, analysis, request.message(), request.hotelId());

        if (selected == null) {
            return response(
                    analysis,
                    "Bạn muốn mình tóm tắt đánh giá của khách sạn nào? Hãy nhập tên khách sạn hoặc mở Trợ lý AI từ khách sạn bạn muốn xem.",
                    List.of(),
                    List.of(),
                    List.of("Tìm khách sạn được đánh giá tốt", "So sánh hai khách sạn")
            );
        }

        ReviewSummaryResponse summary = GroundedData.reviews(selected.hotel().id(), bookingClient.getReviewSummary(selected.hotel().id()));
        List<ReviewResponse> reviews = bookingClient.getReviews(selected.hotel().id())
                .stream()
                .limit(40)
                .toList();

        AssistantHotelCard card = buildHotelCard(selected, analysis);
        if (reviews.isEmpty()) {
            return response(
                    analysis,
                    "Khách sạn %s hiện chưa có đánh giá thật từ booking đã hoàn tất trên EnziuRooms."
                            .formatted(selected.hotel().name()),
                    List.of(card),
                    List.of(),
                    List.of("Xem khách sạn", "Tìm khách sạn có review tốt")
            );
        }

        String answer = "%s: %s/10 từ %d đánh giá.\nMột số nhận xét gần đây (không đại diện cho mọi khách):\n%s".formatted(
                selected.hotel().name(), summary.averageRating() == null ? "chưa có điểm" : String.format(Locale.US, "%.1f", summary.averageRating()),
                summary.reviewCount(), reviews.stream().limit(2)
                        .map(review -> "• %s/10. Khen: %s. Góp ý: %s.".formatted(value(review.rating()), excerpt(review.positiveComment()), excerpt(review.negativeComment())))
                        .collect(Collectors.joining("\n")));

        return response(
                analysis,
                answer,
                List.of(card),
                List.of(),
                List.of("So sánh khách sạn này với khách sạn khác", "Khách sạn này có phù hợp gia đình không?")
        );
    }

    private AssistantResponse answerMyBookings(
            AssistantRequest request,
            IntentAnalysis analysis,
            UUID customerId,
            String bearerToken
    ) {
        List<BookingResponse> bookings = GroundedData.customerBookings(customerId, bookingClient.getCustomerBookings(customerId, bearerToken));
        List<BookingResponse> selected = selectRelevantBookings(bookings, analysis, request.message());
        List<AssistantBookingCard> cards = selected.stream().map(this::toBookingCard).toList();

        if (cards.isEmpty()) {
            return response(
                    analysis,
                    "Mình không tìm thấy booking phù hợp trong tài khoản hiện tại.",
                    List.of(),
                    List.of(),
                    List.of("Booking sắp tới của tôi", "Tôi còn phải thanh toán bao nhiêu?")
            );
        }

        String question = normalize(request.message());
        String answer = cards.stream().map(card -> describeBooking(card, question, cards.size() == 1)).collect(Collectors.joining("\n"));

        return response(
                analysis,
                answer,
                List.of(),
                cards,
                List.of("Booking nào sắp nhận phòng?", "Tôi còn phải thanh toán bao nhiêu?", "Booking của tôi trả phòng lúc mấy giờ?")
        );
    }

    private AssistantResponse answerHotelDetails(AssistantRequest request, IntentAnalysis analysis) {
        HotelWithRoomTypes selected = resolveRequestedHotel(hotelClient.getHotelsWithRoomTypes(), analysis, request.message(), request.hotelId());
        if (selected == null) {
            return response(analysis, "Bạn muốn hỏi khách sạn nào? Hãy nhập tên hoặc mở trợ lý từ trang khách sạn đó.", List.of(), List.of(), List.of());
        }
        HotelResponse hotel = selected.hotel();
        AssistantHotelCard card = buildHotelCard(selected, analysis);
        String question = normalize(request.message());
        String answer;
        if (question.matches(".*(tra phong|check.?out).*")) {
            answer = hotel.name() + ": giờ trả phòng " + known(hotel.checkOutTime()) + ".";
        } else if (question.matches(".*(nhan phong|check.?in).*")) {
            answer = hotel.name() + ": giờ nhận phòng " + known(hotel.checkInTime()) + ".";
        } else if (question.matches(".*(dia chi|o dau|nam (o|tai)|vi tri|address|location).*")) {
            answer = hotel.name() + ": " + known(hotel.address()) + ", " + known(hotel.city()) + ".";
        } else if (question.matches(".*(dien thoai|goi dien|lien he|email|hotline|contact|phone|telephone).*")) {
            answer = hotel.name() + ": điện thoại " + known(hotel.phone()) + "; email " + known(hotel.email()) + ".";
        } else if (question.matches(".*(tien nghi|tien ich|ho boi|wifi|bua sang|gym|spa|facilities|amenities).*")) {
            answer = hotel.name() + ": tiện nghi đã công bố: " + String.join(", ", card.amenities()) + ". Tiện nghi theo loại phòng cần xem chi tiết phòng.";
        } else if (OptionReferences.positions(request.message()).size() == 1
                || question.equals(normalize(hotel.name()))
                || question.matches(".*(thong tin|chi tiet|gioi thieu|xem khach san|details|overview).*")) {
            answer = describeHotel(card);
        } else {
            return response(analysis, "EnziuRooms chưa có dữ liệu xác nhận cho nội dung này tại " + hotel.name()
                    + ". Bạn muốn xem địa chỉ, tiện nghi hay giờ nhận/trả phòng?", List.of(), List.of(), List.of());
        }
        return response(analysis, answer, List.of(card), List.of(), List.of("Tóm tắt đánh giá khách sạn này", "QR nhận phòng hoạt động thế nào?"));
    }

    private AssistantResponse answerRooms(AssistantRequest request, IntentAnalysis analysis, SemanticDecision semantic, String action) {
        RoomRecommendationService.RoomReply reply = new RoomRecommendationService(hotelClient, bookingClient).answer(request, analysis, semantic, action);
        AssistantResponse base = response(analysis, reply.answer(), List.of(), List.of(), reply.suggestions());
        AssistantQueryContext context = new AssistantQueryContext(analysis.city(), analysis.maxBudgetPerNight(), analysis.starRating(), analysis.checkIn(), analysis.checkOut(), analysis.adults(), analysis.children(), analysis.amenities(),
                !reply.rooms().isEmpty() && reply.rooms().stream().allMatch(room -> room.availabilityChecked()), reply.criteria() != null ? reply.criteria()
                : request.conversationContext() != null && request.conversationContext().lastRoomSearch() != null ? request.conversationContext().lastRoomSearch().roomCriteria() : null, analysis.nearby());
        return new AssistantResponse(base.intent(), base.answer(), context, base.hotels(), base.bookings(), base.suggestedPrompts(), base.model(), base.generatedAt(), base.engine(), reply.rooms());
    }

    private AssistantResponse answerGeneral(AssistantRequest request, IntentAnalysis analysis, SemanticDecision semantic) {
        String topic = knowledge.proceduralTopic(request.message()).orElse(semantic == null ? null : semantic.topic());
        String answer = knowledge.answerTopic(topic).orElseGet(() -> knowledge.answer(request.message()));
        return response(
                analysis,
                answer,
                List.of(),
                List.of(),
                List.of("Tìm khách sạn cho 2 người", "Booking sắp tới của tôi", "Tóm tắt đánh giá một khách sạn")
        );
    }

    private ScoredHotel scoreHotel(HotelWithRoomTypes item, IntentAnalysis analysis) {
        HotelResponse hotel = item.hotel();
        boolean availabilityChecked = validDateRange(analysis.checkIn(), analysis.checkOut());
        Map<UUID, Integer> availableByRoomType = availabilityChecked
                ? availableRoomsByType(hotel.id(), analysis.checkIn(), analysis.checkOut())
                : Map.of();

        int adults = analysis.adults() == null ? 1 : analysis.adults();
        int children = analysis.children() == null ? 0 : analysis.children();

        List<RoomTypeResponse> suitable = item.roomTypes().stream()
                .filter(roomType -> isActive(roomType.status()))
                .filter(roomType -> safeInt(roomType.maxAdults(), 0) >= adults)
                .filter(roomType -> safeInt(roomType.maxChildren(), 0) >= children)
                .filter(roomType -> analysis.roomCriteria() == null || !analysis.roomCriteria().refundableOnly() || Boolean.TRUE.equals(roomType.refundable()))
                .filter(roomType -> analysis.roomCriteria() == null || !analysis.roomCriteria().breakfastOnly() || Boolean.TRUE.equals(roomType.breakfastIncluded()))
                .filter(roomType -> allAmenitiesMatch(hotel, roomType, analysis.amenities()))
                .filter(roomType -> !availabilityChecked || availableByRoomType.getOrDefault(roomType.id(), 0) > 0)
                .sorted(Comparator.comparing(RoomTypeResponse::basePrice, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        RoomTypeResponse chosen = suitable.stream()
                .filter(roomType -> analysis.maxBudgetPerNight() == null
                        || roomType.basePrice() != null
                        && roomType.basePrice().compareTo(analysis.maxBudgetPerNight()) <= 0)
                .findFirst()
                .orElse(suitable.stream().findFirst().orElse(null));

        boolean cityMatch = matchesLocation(hotel, analysis.city());
        boolean starMatch = analysis.starRating() == null
                || Objects.equals(hotel.starRating(), analysis.starRating());
        boolean budgetMatch = analysis.maxBudgetPerNight() == null
                || chosen != null && chosen.basePrice() != null
                && chosen.basePrice().compareTo(analysis.maxBudgetPerNight()) <= 0;
        boolean amenityMatch = allAmenitiesMatch(hotel, chosen, analysis.amenities());
        boolean capacityMatch = chosen != null;
        boolean availabilityMatch = !availabilityChecked
                || chosen != null && availableByRoomType.getOrDefault(chosen.id(), 0) > 0;
        boolean exactMatch = cityMatch && starMatch && budgetMatch && amenityMatch && capacityMatch && availabilityMatch;

        ReviewSummaryResponse review = GroundedData.reviews(hotel.id(), bookingClient.getReviewSummary(hotel.id()));
        double score = 0;
        score += cityMatch ? 100 : analysis.city() == null ? 0 : -100;
        score += starMatch ? 22 : analysis.starRating() == null ? 0 : -12;
        score += budgetMatch ? 24 : analysis.maxBudgetPerNight() == null ? 0 : -18;
        score += amenityMatch ? 18 : analysis.amenities().isEmpty() ? 0 : -12;
        score += capacityMatch ? 20 : -80;
        score += availabilityMatch ? 25 : -100;
        if (review.averageRating() != null) score += review.averageRating() * 2.2;

        List<String> reasons = new ArrayList<>();
        if (cityMatch && analysis.city() != null) reasons.add("Đúng khu vực " + analysis.city());
        if (budgetMatch && analysis.maxBudgetPerNight() != null) reasons.add("Trong ngân sách đã nêu");
        if (capacityMatch) reasons.add("Sức chứa phù hợp " + adults + " người lớn" + (children > 0 ? ", " + children + " trẻ em" : ""));
        if (amenityMatch && !analysis.amenities().isEmpty()) reasons.add("Có tiện nghi bạn yêu cầu");
        if (availabilityChecked && availabilityMatch) reasons.add("Còn phòng trong khoảng ngày đã chọn");
        if (review.averageRating() != null && review.reviewCount() > 0) reasons.add("Điểm khách thật " + String.format(Locale.US, "%.1f", review.averageRating()) + "/10");

        AssistantHotelCard card = new AssistantHotelCard(
                hotel.id(),
                hotel.name(),
                hotel.city(),
                java.util.stream.Stream.of(hotel.address(),hotel.ward(),hotel.district()).filter(value->value!=null&&!value.isBlank()).distinct().collect(Collectors.joining(", ")),
                hotel.starRating(),
                hotel.coverImageUrl(),
                review.averageRating(),
                review.reviewCount(),
                chosen == null ? null : chosen.id(),
                chosen == null ? null : chosen.name(),
                chosen == null ? null : chosen.basePrice(),
                chosen == null ? null : chosen.maxAdults(),
                chosen == null ? null : chosen.maxChildren(),
                chosen == null || !availabilityChecked ? null : availableByRoomType.getOrDefault(chosen.id(), 0),
                availabilityChecked,
                exactMatch,
                chosen == null ? null : chosen.refundable(),
                chosen == null ? null : chosen.breakfastIncluded(),
                hotel.checkInTime(),
                hotel.checkOutTime(),
                mergedAmenities(hotel, chosen),
                List.copyOf(reasons)
        );

        return new ScoredHotel(item, card, score, exactMatch, review);
    }

    private AssistantHotelCard buildHotelCard(HotelWithRoomTypes item, IntentAnalysis analysis) {
        return scoreHotel(item, analysis).card();
    }

    private Map<UUID, Integer> availableRoomsByType(UUID hotelId, LocalDate checkIn, LocalDate checkOut) {
        List<RoomResponse> rooms = GroundedData.inventory(hotelId, hotelClient.getRooms(hotelId));
        AvailabilityResponse availability = GroundedData.availability(hotelId, checkIn, checkOut, bookingClient.getAvailability(hotelId, checkIn, checkOut));
        Set<UUID> unavailable = Set.copyOf(availability.unavailableRoomIds());
        boolean todayCheckIn = checkIn.equals(LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")));

        Map<UUID, Integer> counts = new HashMap<>();
        for (RoomResponse room : rooms) {
            if (room.id() == null || room.roomTypeId() == null || unavailable.contains(room.id())) continue;
            if ("MAINTENANCE".equalsIgnoreCase(room.status()) || "INACTIVE".equalsIgnoreCase(room.status())) continue;
            if (todayCheckIn && !"AVAILABLE".equalsIgnoreCase(room.status())) continue;
            counts.merge(room.roomTypeId(), 1, Integer::sum);
        }
        return counts;
    }

    private List<ScoredHotel> selectHotelsForComparison(
            List<ScoredHotel> scored,
            IntentAnalysis analysis,
            String message
    ) {
        LinkedHashSet<UUID> ids = new LinkedHashSet<>();
        List<String> names = analysis.hotelNames() == null ? List.of() : analysis.hotelNames();

        for (ScoredHotel item : scored) {
            String hotelName = normalize(item.item().hotel().name());
            boolean mentioned = normalize(message).contains(hotelName)
                    || names.stream().anyMatch(name -> hotelName.contains(normalize(name)) || normalize(name).contains(hotelName));
            if (mentioned) ids.add(item.item().hotel().id());
        }

        List<ScoredHotel> result = scored.stream()
                .filter(item -> ids.contains(item.item().hotel().id()))
                .limit(3)
                .collect(Collectors.toCollection(ArrayList::new));

        return result.stream().limit(3).toList();
    }

    private HotelWithRoomTypes resolveRequestedHotel(
            List<HotelWithRoomTypes> hotels,
            IntentAnalysis analysis,
            String message,
            UUID explicitHotelId
    ) {
        String normalizedMessage = normalize(message);
        for (HotelWithRoomTypes item : hotels) {
            if (normalizedMessage.contains(normalize(item.hotel().name()))) return item;
        }

        if (explicitHotelId != null) {
            return hotels.stream().filter(item -> explicitHotelId.equals(item.hotel().id())).findFirst().orElse(null);
        }

        if (analysis.hotelNames() != null) {
            for (String requested : analysis.hotelNames()) {
                String requestedName = normalize(requested);
                HotelWithRoomTypes matched = hotels.stream()
                        .filter(item -> normalize(item.hotel().name()).contains(requestedName)
                                || requestedName.contains(normalize(item.hotel().name())))
                        .findFirst()
                        .orElse(null);
                if (matched != null) return matched;
            }
        }
        return null;
    }

    private List<BookingResponse> selectRelevantBookings(
            List<BookingResponse> bookings,
            IntentAnalysis analysis,
            String message
    ) {
        if (bookings == null || bookings.isEmpty()) return List.of();
        if (analysis.bookingCode() != null) {
            return bookings.stream()
                    .filter(item -> analysis.bookingCode().equalsIgnoreCase(item.bookingCode()))
                    .limit(2)
                    .toList();
        }

        String normalized = normalize(message);
        if (normalized.contains("con phai thanh toan") || normalized.contains("chua thanh toan")) {
            return bookings.stream()
                    .filter(item -> item.remainingAmount() != null && item.remainingAmount().compareTo(BigDecimal.ZERO) > 0)
                    .sorted(Comparator.comparing(BookingResponse::checkIn, Comparator.nullsLast(Comparator.naturalOrder())))
                    .limit(4)
                    .toList();
        }

        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        List<BookingResponse> upcoming = bookings.stream()
                .filter(item -> item.checkOut() != null && !item.checkOut().isBefore(today))
                .filter(item -> !"CANCELLED".equalsIgnoreCase(item.status()))
                .sorted(Comparator.comparing(BookingResponse::checkIn, Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(4)
                .toList();
        if (!upcoming.isEmpty()) return upcoming;

        return bookings.stream()
                .sorted(Comparator.comparing(BookingResponse::createdAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(4)
                .toList();
    }

    private AssistantBookingCard toBookingCard(BookingResponse booking) {
        HotelResponse hotel = safeHotel(booking.hotelId());
        RoomTypeResponse roomType = safeRoomType(booking.roomTypeId());
        return new AssistantBookingCard(
                booking.id(),
                booking.bookingCode(),
                booking.hotelId(),
                hotel == null ? "Khách sạn" : hotel.name(),
                hotel == null ? null : hotel.coverImageUrl(),
                roomType == null ? null : roomType.name(),
                booking.checkIn(),
                booking.checkOut(),
                hotel == null ? null : hotel.checkInTime(),
                hotel == null ? null : hotel.checkOutTime(),
                booking.status(),
                booking.paymentStatus(),
                booking.paymentOption(),
                booking.totalPrice(),
                booking.paidAmount(),
                booking.remainingAmount(),
                booking.adults(),
                booking.children(),
                booking.roomRefundableSnapshot()
        );
    }

    private HotelResponse safeHotel(UUID hotelId) {
        if (hotelId == null) return null;
        try {
            return hotelClient.getHotel(hotelId);
        } catch (Exception ignored) {
            return null;
        }
    }

    private RoomTypeResponse safeRoomType(UUID roomTypeId) {
        if (roomTypeId == null) return null;
        try {
            return hotelClient.getRoomType(roomTypeId);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String describeHotel(AssistantHotelCard card) {
        return "• %s — %s; %s: %s/phòng/đêm. %s%s%s".formatted(
                card.name(), known(card.city()), known(card.roomTypeName()), money(card.pricePerNight()),
                card.maxAdults() == null ? "" : "Sức chứa: " + card.maxAdults() + " người lớn, " + known(card.maxChildren()) + " trẻ em. ",
                card.availabilityChecked() ? "Phòng trống: " + known(card.availableRooms()) + ". " : "Chưa kiểm tra phòng trống. ",
                card.averageRating() == null ? "Chưa có điểm đánh giá." : "Đánh giá " + String.format(Locale.US, "%.1f", card.averageRating()) + "/10 (" + card.reviewCount() + ").");
    }

    private String guestDescription(IntentAnalysis analysis) {
        return safeInt(analysis.adults(), 1) + " người lớn"
                + (safeInt(analysis.children(), 0) > 0 ? " và " + analysis.children() + " trẻ em" : "");
    }

    private boolean matchesLocation(HotelResponse hotel, String destination) {
        if (destination == null || destination.isBlank()) return true;
        String location = normalize(String.join(" ", known(hotel.city()), known(hotel.address()), known(hotel.district()), known(hotel.ward())));
        return location.contains(normalize(destination));
    }

    private String explainNoMatch(List<HotelWithRoomTypes> hotels, IntentAnalysis analysis) {
        List<RoomTypeResponse> rooms = hotels.stream()
                .filter(item -> analysis.starRating() == null || Objects.equals(item.hotel().starRating(), analysis.starRating()))
                .flatMap(item -> item.roomTypes().stream()).filter(room -> isActive(room.status())).toList();
        if (rooms.isEmpty()) return "Khu vực này chưa có loại phòng đang mở bán khớp hạng sao bạn chọn. Bạn muốn đổi hạng sao hoặc khu vực không?";
        List<RoomTypeResponse> enoughSpace = rooms.stream()
                .filter(room -> safeInt(room.maxAdults(), 0) >= safeInt(analysis.adults(), 1))
                .filter(room -> safeInt(room.maxChildren(), 0) >= safeInt(analysis.children(), 0)).toList();
        if (enoughSpace.isEmpty()) return "Chưa có loại phòng được cấu hình đủ chỗ cho " + guestDescription(analysis)
                + " tại khu vực này. Bạn muốn tìm ở khu vực khác không?";
        List<RoomTypeResponse> withAmenities = enoughSpace.stream().filter(room -> hotels.stream()
                .filter(item -> item.roomTypes().contains(room)).anyMatch(item -> allAmenitiesMatch(item.hotel(), room, analysis.amenities()))).toList();
        if (withAmenities.isEmpty()) return "Có loại phòng đủ chỗ cho " + guestDescription(analysis)
                + ", nhưng chưa có phòng đáp ứng đủ tiện nghi: " + String.join(", ", analysis.amenities()) + ". Bạn muốn bỏ bớt tiện nghi nào?";
        if (analysis.maxBudgetPerNight() != null && withAmenities.stream().noneMatch(room -> room.basePrice() != null
                && room.basePrice().compareTo(analysis.maxBudgetPerNight()) <= 0)) {
            return "Các loại phòng đủ chỗ chưa có giá cơ bản trong mức " + money(analysis.maxBudgetPerNight())
                    + "/phòng/đêm. Bạn muốn tăng ngân sách hay đổi khu vực?";
        }
        if (validDateRange(analysis.checkIn(), analysis.checkOut())) return "Chưa còn phòng đáp ứng đủ chỗ cho "
                + guestDescription(analysis) + " và tiêu chí đã chọn từ " + analysis.checkIn() + " đến " + analysis.checkOut()
                + ". Bạn muốn đổi ngày ở không?";
        return "Chưa có loại phòng đáp ứng đồng thời số khách và tiêu chí đã chọn. Bạn muốn điều chỉnh tiêu chí nào?";
    }

    private String describeBooking(AssistantBookingCard card, String question, boolean includeHotel) {
        String prefix = "• " + card.bookingCode() + (includeHotel ? " — " + card.hotelName() : "") + ": ";
        if (question.matches(".*(hoan tien|huy|refund).*")) {
            String rule = card.refundable() == null ? "chưa có dữ liệu điều kiện hoàn tiền"
                    : card.refundable() ? "điều kiện đã ghi nhận có áp dụng hoàn tiền" : "điều kiện đã ghi nhận không áp dụng hoàn tiền";
            return prefix + rule + ". Mức hoàn và thời hạn cần khách sạn xác nhận. Xem điều kiện trong chi tiết đơn.";
        }
        if (question.matches(".*(con.*(tra|thanh toan)|chua thanh toan).*")) {
            return prefix + "còn phải thanh toán " + money(card.remainingAmount()) + ".";
        }
        if (question.matches(".*(thanh toan|tien|da tra).*")) {
            return prefix + "tổng " + money(card.totalPrice()) + "; đã trả " + money(card.paidAmount()) + "; còn lại " + money(card.remainingAmount()) + ".";
        }
        if (question.matches(".*(tra phong|check.?out).*")) {
            return prefix + "trả phòng ngày " + known(card.checkOut()) + ", lúc " + known(card.hotelCheckOutTime()) + ".";
        }
        if (question.matches(".*(nhan phong|check.?in).*")) {
            return prefix + "nhận phòng ngày " + known(card.checkIn()) + ", từ " + known(card.hotelCheckInTime()) + ".";
        }
        return prefix + known(card.checkIn()) + " → " + known(card.checkOut()) + "; " + statusLabel(card.bookingStatus())
                + "; còn lại " + money(card.remainingAmount()) + ".";
    }

    private String statusLabel(String status) {
        if (status == null) return "chưa có trạng thái";
        return switch (status) {
            case "PENDING" -> "chờ xác nhận";
            case "PENDING_PAYMENT" -> "chờ thanh toán";
            case "CONFIRMED" -> "đã xác nhận";
            case "CHECKED_IN" -> "đã nhận phòng";
            case "CHECKED_OUT" -> "đã trả phòng";
            case "CANCELLED" -> "đã hủy";
            case "NO_SHOW" -> "không đến nhận phòng";
            default -> status;
        };
    }

    private String money(BigDecimal amount) {
        return amount == null ? "chưa có dữ liệu" : String.format(Locale.forLanguageTag("vi-VN"), "%,.0f ₫", amount);
    }

    private String known(Object value) {
        return value == null || value.toString().isBlank() ? "chưa có dữ liệu" : value.toString();
    }

    private String excerpt(String text) {
        if (text == null || text.isBlank()) return "không nêu";
        String clean = text.replaceAll("[\\r\\n]+", " ").trim();
        return "“" + (clean.length() > 110 ? clean.substring(0, 107) + "…" : clean) + "”";
    }

    private AssistantResponse response(
            IntentAnalysis analysis,
            String answer,
            List<AssistantHotelCard> hotels,
            List<AssistantBookingCard> bookings,
            List<String> suggestedPrompts
    ) {
        return new AssistantResponse(
                analysis.intent(),
                answer,
                new AssistantQueryContext(
                        analysis.city(), analysis.maxBudgetPerNight(), analysis.starRating(),
                        analysis.checkIn(), analysis.checkOut(),
                        analysis.adults(), analysis.children(),
                        analysis.amenities() == null ? List.of() : analysis.amenities(),
                        !hotels.isEmpty() && hotels.stream().allMatch(AssistantHotelCard::availabilityChecked), analysis.roomCriteria(), analysis.nearby()
                ),
                hotels,
                bookings,
                suggestedPrompts,
                SystemKnowledgeService.MODEL,
                Instant.now(),
                AssistantEngine.local(SystemKnowledgeService.MODEL),
                List.of()
        );
    }

    static boolean allAmenitiesMatch(HotelResponse hotel, RoomTypeResponse roomType, List<String> requested) {
        if (requested == null || requested.isEmpty()) return true;
        String data = normalize(String.join(" ", mergedAmenities(hotel, roomType)));
        return requested.stream().allMatch(item -> normalize(item).matches(".*(bua sang|an sang|breakfast).*") && roomType != null
                ? Boolean.TRUE.equals(roomType.breakfastIncluded()) : amenityMatches(data, item));
    }

    private static boolean amenityMatches(String normalizedData, String requested) {
        String value = normalize(requested);
        if (normalizedData.replaceAll("[^a-z0-9]", "").contains(value.replaceAll("[^a-z0-9]", ""))) return true;
        if (normalizedData.contains(value)) return true;
        if (value.contains("wifi")) return normalizedData.contains("wifi");
        if (value.contains("ho boi")) return normalizedData.contains("ho boi") || normalizedData.contains("be boi") || normalizedData.contains("pool");
        if (value.contains("bua sang")) return normalizedData.contains("bua sang") || normalizedData.contains("breakfast");
        if (value.contains("phong gym")) return normalizedData.contains("gym") || normalizedData.contains("phong tap");
        if (value.contains("bai do xe")) return normalizedData.contains("do xe") || normalizedData.contains("dau xe") || normalizedData.contains("parking");
        if (value.contains("dieu hoa")) return normalizedData.contains("dieu hoa") || normalizedData.contains("may lanh") || normalizedData.contains("air conditioning") || normalizedData.contains("air_conditioning");
        return false;
    }

    private static List<String> mergedAmenities(HotelResponse hotel, RoomTypeResponse roomType) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        if (hotel.amenities() != null) values.addAll(hotel.amenities());
        if (roomType != null && roomType.amenities() != null) values.addAll(roomType.amenities());
        if (roomType != null && Boolean.TRUE.equals(roomType.breakfastIncluded())) values.add("Có bữa sáng");
        return values.stream().limit(10).toList();
    }

    private boolean isActive(String status) {
        return status == null || status.isBlank() || "ACTIVE".equalsIgnoreCase(status);
    }

    private boolean validDateRange(LocalDate checkIn, LocalDate checkOut) {
        return checkIn != null && checkOut != null && checkOut.isAfter(checkIn);
    }

    private void validateTripDates(IntentAnalysis analysis) {
        if ((analysis.checkIn() == null) != (analysis.checkOut() == null)) {
            throw new IllegalArgumentException("Vui lòng chọn cả ngày nhận phòng và ngày trả phòng để kiểm tra phòng trống.");
        }
        if (analysis.checkIn() != null && analysis.checkIn().isBefore(LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")))) {
            throw new IllegalArgumentException("Ngày nhận phòng không được ở trong quá khứ.");
        }
        if (analysis.checkIn() != null && !analysis.checkOut().isAfter(analysis.checkIn())) {
            throw new IllegalArgumentException("Ngày trả phòng phải sau ngày nhận phòng.");
        }
    }

    private UUID currentUserId(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new IllegalStateException("Không xác định được Customer hiện tại");
        }
        return UUID.fromString(jwt.getSubject());
    }

    private int safeInt(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private Object value(Object value) {
        return value == null ? "chưa có dữ liệu" : value;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();
    }

    private record ScoredHotel(
            HotelWithRoomTypes item,
            AssistantHotelCard card,
            double score,
            boolean exactMatch,
            ReviewSummaryResponse review
    ) {
    }
}
