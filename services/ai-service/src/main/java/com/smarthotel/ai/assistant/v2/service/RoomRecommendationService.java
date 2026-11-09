package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.booking.BookingClient;
import com.smarthotel.ai.integration.booking.dto.AvailabilityResponse;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.*;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/** Recommendations and explanations are derived from current system facts, never model-generated facts. */
public class RoomRecommendationService {
    private final HotelClient hotels;
    private final BookingClient bookings;

    public RoomRecommendationService(HotelClient hotels, BookingClient bookings) {
        this.hotels = hotels;
        this.bookings = bookings;
    }

    public RoomReply answer(AssistantRequest request, IntentAnalysis criteria, SemanticDecision semantic) {
        return answer(request, criteria, semantic, semantic == null ? "NONE" : semantic.action());
    }

    public RoomReply answer(AssistantRequest request, IntentAnalysis criteria, SemanticDecision semantic, String action) {
        UUID selectedHotelId = request.hotelId();
        String question = SystemKnowledgeService.normalize(request.message());
        if ((question.contains("hotel") || question.contains("khach san"))
                && !question.contains("khach san do") && !question.contains("khach san nay")) {
            Optional<HotelResponse> named = hotels.getHotels().stream().filter(item -> item.name() != null && !item.name().isBlank())
                    .filter(item -> question.contains(SystemKnowledgeService.normalize(item.name()))).findFirst();
            if (named.isPresent()) selectedHotelId = named.get().id();
        }
        if (selectedHotelId == null) {
            return new RoomReply("Bạn muốn chọn phòng ở khách sạn nào? Hãy mở khách sạn đó hoặc cho tôi biết tên khách sạn.", List.of(), List.of());
        }
        HotelResponse hotel = hotels.getHotel(selectedHotelId);
        if (hotel == null || !active(hotel.status())) {
            return new RoomReply("Chưa lấy được thông tin khách sạn đang xem. Bạn hãy chọn lại khách sạn.", List.of(), List.of());
        }
        List<RoomTypeResponse> types = hotels.getRoomTypes(hotel.id()).stream().filter(type -> active(type.status())).toList();
        if (types.isEmpty()) return new RoomReply(hotel.name() + " chưa có loại phòng đang mở bán.", List.of(), List.of());
        boolean checked = criteria.checkIn() != null && criteria.checkOut() != null;
        Map<UUID, Integer> available = checked ? availability(hotel.id(), criteria.checkIn(), criteria.checkOut()) : Map.of();
        int adults = criteria.adults() == null ? 1 : criteria.adults();
        int children = criteria.children() == null ? 0 : criteria.children();
        List<RoomTypeResponse> suitable = types.stream()
                .filter(type -> type.maxAdults() != null && type.maxAdults() >= adults)
                .filter(type -> children == 0 || type.maxChildren() != null && type.maxChildren() >= children)
                .filter(type -> criteria.maxBudgetPerNight() == null || type.basePrice() != null && type.basePrice().compareTo(criteria.maxBudgetPerNight()) <= 0)
                .filter(type -> GroundedAssistantService.allAmenitiesMatch(hotel, type, criteria.amenities()))
                .filter(type -> !checked || available.getOrDefault(type.id(), 0) > 0).toList();
        if (suitable.isEmpty()) {
            String explanation = checked ? " trong ngày " + criteria.checkIn() + " → " + criteria.checkOut() : " theo cấu hình hiện tại";
            return new RoomReply(hotel.name() + " chưa có phòng đáp ứng " + guestText(adults, children) + " và tiêu chí đã chọn" + explanation
                    + ". Bạn muốn đổi ngày hoặc xem khách sạn khác?", List.of(), List.of("Tìm khách sạn khác"));
        }
        AssistantRoomCriteria roomCriteria = criteria.roomCriteria() != null ? criteria.roomCriteria() : roomCriteria(request, semantic, action, hotel.id());
        String preference = roomCriteria.preference() == null ? "BALANCED" : roomCriteria.preference();
        Comparator<RoomTypeResponse> ordering = switch (preference) {
            case "CHEAPEST" -> Comparator.comparing(RoomTypeResponse::basePrice, Comparator.nullsLast(Comparator.naturalOrder()));
            case "LARGEST" -> Comparator.comparing(RoomTypeResponse::areaSqm, Comparator.nullsLast(Comparator.reverseOrder()));
            default -> Comparator.comparingDouble(this::balancedScore).reversed()
                    .thenComparing(RoomTypeResponse::basePrice, Comparator.nullsLast(Comparator.naturalOrder()));
        };
        if (roomCriteria.refundableOnly()) suitable = suitable.stream().filter(type -> Boolean.TRUE.equals(type.refundable())).toList();
        if (roomCriteria.breakfastOnly()) suitable = suitable.stream().filter(type -> Boolean.TRUE.equals(type.breakfastIncluded())).toList();
        if (suitable.isEmpty()) return new RoomReply("Chưa có phòng đủ chỗ đáp ứng điều kiện "
                + (roomCriteria.refundableOnly() ? "hoàn tiền" : "bao gồm bữa sáng") + " tại " + hotel.name() + ".", List.of(), List.of());
        if ("LARGEST".equals(preference) && suitable.stream().noneMatch(room -> room.areaSqm() != null)) {
            return new RoomReply("Khách sạn chưa cung cấp diện tích các loại phòng phù hợp nên tôi chưa thể xác định phòng rộng nhất.", List.of(), List.of("Xem các loại phòng phù hợp"));
        }
        if ("CHEAPEST".equals(preference) && suitable.stream().noneMatch(room -> room.basePrice() != null)) {
            return new RoomReply("Chưa có giá cơ bản của các loại phòng phù hợp nên tôi chưa thể xác định phòng rẻ nhất.", List.of(), List.of());
        }
        List<RoomTypeResponse> selected = suitable.stream().sorted(ordering).limit(3).toList();
        if ("MORE_ROOMS".equals(action)) {
            var state = request.conversationContext();
            List<UUID> seen = state == null || !hotel.id().equals(state.roomHotelId()) || state.shownRoomIds() == null ? List.of() : state.shownRoomIds();
            selected = suitable.stream().filter(type -> !seen.contains(type.id())).sorted(ordering).limit(3).toList();
            if (selected.isEmpty()) return new RoomReply("Tôi đã giới thiệu hết các loại phòng phù hợp tại " + hotel.name()
                    + ". Bạn muốn đổi tiêu chí hay tìm khách sạn khác?", List.of(), List.of("Tìm khách sạn khác"));
        }
        if ("SELECT_OPTION".equals(action)) {
            int index = DialoguePolicy.ordinal(request.message());
            var state = request.conversationContext();
            var ids = state == null || state.roomTypeIds() == null ? List.<UUID>of() : state.roomTypeIds();
            if (index < 0 || index >= ids.size() || !hotel.id().equals(state.roomHotelId()))
                return new RoomReply("Tôi chưa xác định được lựa chọn đó. Bạn cho biết tên loại phòng muốn xem nhé.", List.of(), List.of());
            UUID selectedId = ids.get(index);
            selected = suitable.stream().filter(type -> selectedId.equals(type.id())).toList();
            if (selected.isEmpty()) return new RoomReply("Loại phòng bạn chọn hiện không còn đáp ứng số khách, ngày ở hoặc tiêu chí mới. Bạn muốn xem các phòng phù hợp hiện tại không?", List.of(), List.of());
        }
        boolean compare = "ROOM_COMPARE".equals(criteria.intent());
        if (compare) {
            List<UUID> contextIds = request.conversationContext() == null || request.conversationContext().roomTypeIds() == null
                    ? List.of() : request.conversationContext().roomTypeIds();
            String message = SystemKnowledgeService.normalize(request.message());
            List<RoomTypeResponse> named = suitable.stream().filter(type -> message.contains(SystemKnowledgeService.normalize(type.name()))).toList();
            List<Integer> positions = OptionReferences.positions(request.message());
            if (!positions.isEmpty()) {
                var state = request.conversationContext();
                List<UUID> requested = state != null && hotel.id().equals(state.roomHotelId()) ? OptionReferences.resolve(positions, contextIds) : List.of();
                List<RoomTypeResponse> options = suitable;
                selected = requested.stream().flatMap(id -> options.stream().filter(type -> id.equals(type.id()))).toList();
                if (requested.size() < 2 || selected.size() != requested.size()) return new RoomReply("Tôi chưa xác định được đủ loại phòng bạn chọn trong danh sách vừa hiển thị. Bạn cho biết ít nhất hai số thứ tự khác nhau hoặc tên loại phòng nhé.", List.of(), List.of());
            } else if (named.size() >= 2) selected = named.stream().limit(3).toList();
            else if (contextIds.size() >= 2) {
                List<RoomTypeResponse> comparisonOptions = suitable;
                selected = contextIds.stream().limit(2).flatMap(id -> comparisonOptions.stream().filter(type -> id.equals(type.id()))).toList();
            }
            if (selected.size() < 2) return new RoomReply("Hiện chỉ có một loại phòng phù hợp để xem. Bạn muốn so sánh thêm loại phòng nào?", List.of(), List.of());
        }
        List<AssistantRoomCard> cards = selected.stream().map(type -> card(type, hotel, criteria, available, checked)).toList();
        AssistantRoomCard first = cards.get(0);
        String answer;
        if (compare) {
            answer = "Tại " + hotel.name() + ":\n" + cards.stream().map(room -> "• " + room.name() + ": " + money(room.basePrice())
                    + "/đêm; " + (room.areaSqm() == null ? "chưa có diện tích" : room.areaSqm().stripTrailingZeros().toPlainString() + " m²")
                    + (Boolean.TRUE.equals(room.breakfastIncluded()) ? "; có bữa sáng" : "")
                    + (Boolean.TRUE.equals(room.refundable()) ? "; có áp dụng hoàn tiền" : "")).collect(Collectors.joining("\n"));
        } else if ("SELECT_OPTION".equals(action)) {
            answer = first.name() + " tại " + hotel.name() + ": " + money(first.basePrice()) + "/phòng/đêm; tối đa "
                    + guestText(first.maxAdults(), first.maxChildren() == null ? 0 : first.maxChildren())
                    + (first.areaSqm() == null ? "; chưa có diện tích" : "; " + first.areaSqm().stripTrailingZeros().toPlainString() + " m²")
                    + (first.breakfastIncluded() == null ? "; chưa có thông tin bữa sáng" : Boolean.TRUE.equals(first.breakfastIncluded()) ? "; gồm bữa sáng" : "; không gồm bữa sáng")
                    + (first.refundable() == null ? "; chưa có điều kiện hoàn tiền" : Boolean.TRUE.equals(first.refundable()) ? "; có áp dụng hoàn tiền theo điều kiện phòng" : "; không hỗ trợ hoàn tiền");
        } else {
            String priority = switch (preference) {
                case "CHEAPEST" -> " có giá cơ bản thấp nhất trong các phòng phù hợp";
                case "LARGEST" -> " có diện tích lớn nhất trong các phòng có thông tin diện tích và đáp ứng số khách";
                default -> " đáp ứng " + guestText(adults, children);
            };
            String highlights = String.join(", ", first.matchReasons().stream().filter(reason -> !reason.startsWith("Đủ chỗ")).limit(2).toList());
            answer = "Tại " + hotel.name() + ", tôi gợi ý " + first.name() + ": phòng này" + priority + ". "
                    + (highlights.isBlank() ? "" : highlights + ". ") + "Giá cơ bản " + money(first.basePrice()) + "/phòng/đêm.";
        }
        answer += checked ? " Phòng trống đã kiểm tra theo ngày bạn chọn; giá cuối cùng xem khi đặt."
                : " Chọn ngày ở để kiểm tra phòng trống và giá cuối cùng.";
        return new RoomReply(answer, cards, List.of("So sánh hai loại phòng này", "Loại nào rẻ nhất?", "Tôi ưu tiên phòng rộng hơn"), roomCriteria);
    }

    private AssistantRoomCriteria roomCriteria(AssistantRequest request, SemanticDecision semantic, String action, UUID hotel) {
        var state = request.conversationContext();
        var previous = state != null && hotel.equals(state.roomHotelId()) && state.lastRoomSearch() != null
                ? state.lastRoomSearch().roomCriteria() : null;
        String preference = semantic == null || semantic.preference() == null ? fallbackPreference(request.message()) : semantic.preference();
        if (previous != null && "BALANCED".equals(preference) && List.of("MORE_ROOMS", "RECHECK_TRIP", "SELECT_OPTION").contains(action)) preference = previous.preference();
        boolean refundable = "REFUNDABLE".equals(preference) || previous != null && previous.refundableOnly();
        boolean breakfast = "BREAKFAST".equals(preference) || previous != null && previous.breakfastOnly();
        String message = SystemKnowledgeService.normalize(request.message());
        if (message.matches(".*\\b(bo|khong can|khong yeu cau)\\b.*hoan tien.*")) refundable = false;
        if (message.matches(".*\\b(bo|khong can|khong yeu cau)\\b.*(bua sang|an sang).*")) breakfast = false;
        if (semantic != null && semantic.slots() != null) {
            if (semantic.slots().refundableOnly() != null) refundable = semantic.slots().refundableOnly();
            if (semantic.slots().breakfastOnly() != null) breakfast = semantic.slots().breakfastOnly();
        }
        return new AssistantRoomCriteria(refundable, breakfast, preference == null ? "BALANCED" : preference);
    }

    private AssistantRoomCard card(RoomTypeResponse room, HotelResponse hotel, IntentAnalysis criteria, Map<UUID, Integer> counts, boolean checked) {
        List<String> reasons = new ArrayList<>();
        reasons.add("Đủ chỗ cho " + guestText(criteria.adults() == null ? 1 : criteria.adults(), criteria.children() == null ? 0 : criteria.children()));
        if (room.areaSqm() != null) reasons.add("Diện tích " + room.areaSqm().stripTrailingZeros().toPlainString() + " m²");
        if (Boolean.TRUE.equals(room.breakfastIncluded())) reasons.add("Có bữa sáng");
        if (Boolean.TRUE.equals(room.refundable())) reasons.add("Có áp dụng hoàn tiền theo điều kiện phòng");
        if (checked) reasons.add("Còn " + counts.getOrDefault(room.id(), 0) + " phòng theo ngày đã chọn");
        return new AssistantRoomCard(room.id(), hotel.id(), hotel.name(), room.name(), room.basePrice(), room.maxAdults(), room.maxChildren(),
                room.bedType(), room.bedCount(), room.areaSqm(), room.breakfastIncluded(), room.refundable(),
                room.amenities() == null ? List.of() : room.amenities().stream().sorted().toList(),
                room.coverImageUrl() == null ? List.of() : List.of(room.coverImageUrl()), checked ? counts.getOrDefault(room.id(), 0) : null,
                checked, criteria.checkIn(), criteria.checkOut(), criteria.adults(), criteria.children(), reasons);
    }

    private Map<UUID, Integer> availability(UUID hotel, LocalDate start, LocalDate end) {
        AvailabilityResponse result = GroundedData.availability(hotel, start, end, bookings.getAvailability(hotel, start, end));
        Set<UUID> blocked = new HashSet<>(result.unavailableRoomIds());
        Map<UUID, Integer> counts = new HashMap<>();
        boolean today = !start.isAfter(LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")));
        for (RoomResponse room : GroundedData.inventory(hotel, hotels.getRooms(hotel))) {
            if (room.id() == null || room.roomTypeId() == null || blocked.contains(room.id())) continue;
            if ("MAINTENANCE".equalsIgnoreCase(room.status()) || "INACTIVE".equalsIgnoreCase(room.status())) continue;
            if (today && !"AVAILABLE".equalsIgnoreCase(room.status())) continue;
            counts.merge(room.roomTypeId(), 1, Integer::sum);
        }
        return counts;
    }

    private double balancedScore(RoomTypeResponse room) {
        return (room.areaSqm() == null ? 0 : Math.min(10, room.areaSqm().doubleValue() / 5))
                + (Boolean.TRUE.equals(room.breakfastIncluded()) ? 3 : 0) + (Boolean.TRUE.equals(room.refundable()) ? 3 : 0);
    }

    private boolean active(String status) { return status == null || "ACTIVE".equalsIgnoreCase(status); }
    private String fallbackPreference(String message) {
        String text = SystemKnowledgeService.normalize(message);
        if (text.matches(".*\\bre\\b.*") || text.contains("tiet kiem")) return "CHEAPEST";
        if (text.contains("rong") || text.contains("dien tich")) return "LARGEST";
        return "BALANCED";
    }
    private String guestText(int adults, int children) { return adults + " người lớn" + (children > 0 ? " và " + children + " trẻ em" : ""); }
    private String money(BigDecimal value) { return value == null ? "chưa có giá" : String.format(Locale.forLanguageTag("vi-VN"), "%,.0f ₫", value); }
    public record RoomReply(String answer, List<AssistantRoomCard> rooms, List<String> suggestions, AssistantRoomCriteria criteria) {
        public RoomReply(String answer, List<AssistantRoomCard> rooms, List<String> suggestions) {
            this(answer, rooms, suggestions, null);
        }
    }
}
