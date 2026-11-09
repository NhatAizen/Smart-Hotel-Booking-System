package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
import com.smarthotel.ai.assistant.v2.dto.IntentAnalysis;
import com.smarthotel.ai.assistant.v2.dto.NearbyLocation;
import com.smarthotel.ai.assistant.v2.dto.SemanticDecision;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class IntentAnalysisService {
    private final LocalSemanticClient semantic;

    public IntentAnalysisService() { this.semantic = null; }

    @Autowired
    public IntentAnalysisService(LocalSemanticClient semantic) { this.semantic = semantic; }

    public Understanding understand(AssistantRequest request) {
        IntentAnalysis current = fallback(request);
        // This path already overrides model decisions below. Resolve reviewed
        // procedures immediately instead of paying for inference with no benefit.
        if (new SystemKnowledgeService().proceduralTopic(request.message()).isPresent()) {
            return new Understanding(new IntentAnalysis("GENERAL",current.city(),current.maxBudgetPerNight(),current.starRating(),
                    current.adults(),current.children(),current.checkIn(),current.checkOut(),current.amenities(),current.hotelNames(),current.bookingCode(),current.roomCriteria()),null,"NONE");
        }
        SemanticDecision decision = semantic == null ? null : semantic.classify(request).orElse(null);
        if(semantic!=null && semantic.enabled() && decision==null) {
            // Losing the planner must not silently lose the customer's filters.
            var uncertain=new IntentAnalysis("CLARIFY",current.city(),current.maxBudgetPerNight(),current.starRating(),
                    current.adults(),current.children(),current.checkIn(),current.checkOut(),current.amenities(),current.hotelNames(),current.bookingCode(),current.roomCriteria());
            return new Understanding(uncertain,null,"NONE",true);
        }
        current = DialoguePolicy.explicitSlots(current, decision);
        String action = decision != null && List.of("NONE", "NEW_SEARCH", "MORE_HOTELS", "MORE_ROOMS", "MORE_OPTIONS", "SELECT_OPTION", "REFINE_SEARCH", "RECHECK_TRIP", "CHOOSE_OPTION").contains(decision.action() == null ? "" : decision.action())
                ? decision.action() : fallbackAction(request.message());
        String intent = decision == null ? current.intent() : decision.intent();
        boolean directions = "DIRECTIONS".equals(intent) || GeographicQuery.coordinates(request);
        boolean roomList = request.hotelId() != null && DialoguePolicy.roomListRequested(request.message());
        // Reading room types belongs to the room capability, not the property's
        // address/facilities capability, even if the model confuses their labels.
        if (roomList && List.of("HOTEL_DETAILS", "CLARIFY").contains(intent)) intent = "ROOM_RECOMMEND";
        // Resolve an uncertain label from information already supplied by the UI.
        // A selected hotel plus an explicit room-selection task is sufficient to
        // apply the documented balanced ranking; no hotel name needs repeating.
        if ("CLARIFY".equals(intent) && "NONE".equals(action)) {
            String question = normalize(request.message());
            if (current.city() != null && "RECOMMEND_HOTELS".equals(current.intent())
                    && question.matches(".*(phong|khach san|cho nghi|luu tru).*")) {
                intent = "RECOMMEND_HOTELS";
                action = "NEW_SEARCH";
            } else if (request.hotelId() != null && question.matches(".*(phong.*(nao|tot|phu hop|dang)|loai nao|(chon|goi y|tu van).*phong).*")) {
                intent = "ROOM_RECOMMEND";
            }
        }
        var slots = decision == null ? null : decision.slots();
        boolean spatialEdit = slots != null && (slots.landmark() != null || slots.radiusKm() != null || Boolean.TRUE.equals(slots.clearNearby()));
        // Current task takes precedence over prior focus. Memory supplies missing
        // constraints; it cannot turn a new hotel request into a room request.
        boolean hotelTask = "RECOMMEND_HOTELS".equals(intent) || spatialEdit;
        if (spatialEdit) {
            intent = "RECOMMEND_HOTELS";
            action = slots.landmark() != null ? "NEW_SEARCH" : "REFINE_SEARCH";
        }
        boolean roomContext = !hotelTask && (DialoguePolicy.roomContext(request) || roomList);
        boolean explicitComparison = OptionReferences.comparisonRequested(request.message());
        if (!explicitComparison && request.conversationContext() != null
                && "COMPARE_HOTELS".equals(request.conversationContext().lastIntent()) && HotelComparisonPresenter.hasFocus(request.message())
                && List.of("CLARIFY", "COMPARE_HOTELS").contains(intent)) {
            intent = "COMPARE_HOTELS";
        }
        if (explicitComparison) {
            String subject = normalize(request.message());
            intent = subject.contains("khach san") ? "COMPARE_HOTELS"
                    : subject.matches(".*\\b(phong|loai phong)\\b.*") || roomContext ? "ROOM_COMPARE" : "COMPARE_HOTELS";
        }
        if (!explicitComparison && OptionReferences.alternativesRequested(request.message())
                && List.of("ROOM_COMPARE", "COMPARE_HOTELS").contains(intent)
                && List.of("MORE_HOTELS", "MORE_ROOMS", "MORE_OPTIONS").contains(action)) {
            intent = "ROOM_COMPARE".equals(intent) ? "ROOM_RECOMMEND" : "RECOMMEND_HOTELS";
        }
        boolean comparison = List.of("ROOM_COMPARE", "COMPARE_HOTELS").contains(intent);
        // An action prediction must be compatible with its subject. FAQ and personal data
        // questions cannot accidentally turn into searches because of embedding similarity.
        if (List.of("GENERAL", "MY_BOOKINGS", "HOTEL_DETAILS", "REVIEW_SUMMARY", "OUT_OF_SCOPE").contains(intent)) action = "NONE";
        if ("CLARIFY".equals(intent) && !List.of("MORE_OPTIONS", "REFINE_SEARCH", "RECHECK_TRIP", "SELECT_OPTION").contains(action)) action = "NONE";
        if (DialoguePolicy.constraintEdit(request.message())) action = "REFINE_SEARCH";
        if (DialoguePolicy.ordinal(request.message()) >= 0 && !List.of("ROOM_COMPARE", "COMPARE_HOTELS").contains(intent)) action = "SELECT_OPTION";
        // Comparison is a read of selected options, never pagination or selection.
        // The model's independently predicted action cannot replace this task.
        if (comparison && !"CHOOSE_OPTION".equals(action)) action = "NONE";
        if ("MORE_OPTIONS".equals(action)) {
            if (roomContext) action = "MORE_ROOMS";
            else if (lastSearchWasHotels(request)) action = "MORE_HOTELS";
            else intent = "CLARIFY";
        }
        if (!comparison && current.city() != null && !List.of("GENERAL", "MY_BOOKINGS", "HOTEL_DETAILS", "REVIEW_SUMMARY").contains(intent)
                && request.conversationContext() != null && request.conversationContext().lastHotelSearch() != null
                && !normalize(current.city()).equals(normalize(request.conversationContext().lastHotelSearch().city()))) {
            action = "NEW_SEARCH";
        }
        IntentAnalysis filters = current;
        var state = request.conversationContext();
        boolean completingNearbyCity=state!=null && state.lastHotelSearch()!=null && state.lastHotelSearch().nearby()!=null
                && "RECOMMEND_HOTELS".equals(intent) && DialoguePolicy.cityReply(request.message(),current.city())
                && (DialoguePolicy.pendingLandmark(request) || CityNames.same(current.city(),state.lastHotelSearch().city()));
        if(completingNearbyCity) action="REFINE_SEARCH";
        var memory = state == null ? null : roomContext && (List.of("MORE_ROOMS", "REFINE_SEARCH", "RECHECK_TRIP", "SELECT_OPTION").contains(action) || List.of("ROOM_RECOMMEND", "ROOM_COMPARE").contains(intent))
                ? state.lastRoomSearch() : "COMPARE_HOTELS".equals(intent) || List.of("MORE_HOTELS", "REFINE_SEARCH", "RECHECK_TRIP", "SELECT_OPTION").contains(action) ? state.lastHotelSearch() : null;
        boolean selectedFromSearch = state != null && request.hotelId() != null
                && (state.hotelIds() != null && state.hotelIds().contains(request.hotelId())
                || state.shownHotelIds() != null && state.shownHotelIds().contains(request.hotelId()));
        if (memory == null && state != null && hotelTask && (!"NEW_SEARCH".equals(action) || spatialEdit)) memory = state.lastHotelSearch();
        if (directions && state != null) memory=state.lastHotelSearch();
        if (completingNearbyCity) memory=state.lastHotelSearch();
        if (memory == null && selectedFromSearch && List.of("ROOM_RECOMMEND", "ROOM_COMPARE").contains(intent)) memory = state.lastHotelSearch();
        if (memory != null || "NEW_SEARCH".equals(action) || DialoguePolicy.totalBudget(request.message())) {
            filters = DialoguePolicy.merge(request, current, memory, decision != null && decision.slots() != null);
        }
        // A new destination begins a new search, even when the user also says "khác".
        if ("MORE_HOTELS".equals(action) && current.city() != null && request.conversationContext() != null
                && request.conversationContext().lastHotelSearch() != null
                && !normalize(current.city()).equals(normalize(request.conversationContext().lastHotelSearch().city()))) {
            action = "NEW_SEARCH";
            filters = current;
        }
        if ("MORE_HOTELS".equals(action)) intent = "RECOMMEND_HOTELS";
        if ("MORE_ROOMS".equals(action)) intent = "ROOM_RECOMMEND";
        if ("REFINE_SEARCH".equals(action)) {
            if (!List.of("ROOM_RECOMMEND", "RECOMMEND_HOTELS").contains(intent)) {
                if (roomContext) intent = "ROOM_RECOMMEND";
                else if (lastSearchWasHotels(request)) intent = "RECOMMEND_HOTELS";
            }
        }
        if ("SELECT_OPTION".equals(action) && !List.of("HOTEL_DETAILS","ROOM_RECOMMEND").contains(intent)) intent = roomContext ? "ROOM_RECOMMEND" : lastSearchWasHotels(request) ? "HOTEL_DETAILS" : "CLARIFY";
        if ("RECHECK_TRIP".equals(action)) {
            intent = lastSearchWasHotels(request) || request.hotelId() == null ? "RECOMMEND_HOTELS" : "ROOM_RECOMMEND";
        }
        if ("NEW_SEARCH".equals(action) && (current.city() != null || spatialEdit)) intent = "RECOMMEND_HOTELS";
        if (current.city() != null && "RECOMMEND_HOTELS".equals(current.intent())
                && normalize(request.message()).matches(".*(tim|goi y|de xuat).*khach san.*")) {
            intent = "RECOMMEND_HOTELS";
            if ("NONE".equals(action)) action = "NEW_SEARCH";
        }
        boolean reviewedGuide = new SystemKnowledgeService().proceduralTopic(request.message()).isPresent();
        if (reviewedGuide) {
            intent = "GENERAL";
            action = "NONE";
        }
        if ("MY_BOOKINGS".equals(current.intent()) && !reviewedGuide) intent = "MY_BOOKINGS";
        if (decision == null && "NONE".equals(action) && !normalize(request.message()).matches(".*(tim khach san|khach san nao).*" )
                && normalize(request.message()).matches(".*(phong nao|loai nao|phong (do|nay)|khach san do|hai phong|2 phong).*")) {
            intent = normalize(request.message()).contains("so sanh") ? "ROOM_COMPARE" : "ROOM_RECOMMEND";
        }
        filters = DialoguePolicy.slotEdits(filters, decision);
        if (directions) {intent="DIRECTIONS";action="NONE";}
        if (comparison && memory != null) {
            boolean people = normalize(request.message()).matches(".*\\b(nguoi|tre|be|con|vo|chong|adults?|children|kids)\\b.*");
            boolean dates = !inferDates(request.message()).isEmpty();
            // Comparison/advice keeps the destination too. A preposition in an
            // abstract follow-up is not evidence of a new city.
            String comparisonCity = decision != null && decision.slots() != null && decision.slots().city() != null
                    ? decision.slots().city() : memory.city();
            filters = new IntentAnalysis(filters.intent(),comparisonCity,filters.maxBudgetPerNight(),filters.starRating(),
                    !people && memory.adults()!=null ? memory.adults() : filters.adults(),
                    !people && memory.children()!=null ? memory.children() : filters.children(),
                    !dates && memory.checkIn()!=null ? memory.checkIn() : filters.checkIn(),
                    !dates && memory.checkOut()!=null ? memory.checkOut() : filters.checkOut(),
                    filters.amenities(),filters.hotelNames(),filters.bookingCode(),filters.roomCriteria());
        }
        if ("OUT_OF_SCOPE".equals(intent)) intent = "GENERAL";
        String city = List.of("ROOM_RECOMMEND", "ROOM_COMPARE", "HOTEL_DETAILS").contains(intent) ? null : filters.city();
        NearbyLocation nearby = null;
        var previousNearby = state == null || state.lastHotelSearch() == null ? null : state.lastHotelSearch().nearby();
        boolean pendingNearby = previousNearby != null && !LandmarkResolver.valid(previousNearby.latitude(),previousNearby.longitude());
        boolean explicitHotelDestination = current.city() != null && normalize(request.message()).matches(".*\\b(khach san|cho nghi|hotels?|accommodation)\\b.*");
        if (slots != null && slots.landmark() != null && !completingNearbyCity) nearby = NearbyLocation.requested(slots.landmark(),
                slots.radiusKm() != null ? slots.radiusKm() : pendingNearby ? previousNearby.radiusKm() : null);
        else if (previousNearby != null && !(slots != null && Boolean.TRUE.equals(slots.clearNearby()))
                && !("NEW_SEARCH".equals(action) && current.city() != null && (!pendingNearby || explicitHotelDestination))) {
            nearby = NearbyLocation.requested(previousNearby.query(), slots != null && slots.radiusKm() != null ? slots.radiusKm() : previousNearby.radiusKm());
        }
        // No arbitrary preposition-derived fallback city is allowed to stand in
        // for a POI. The previous destination is only a disambiguation hint.
        if (spatialEdit && (slots.city() == null || slots.city().isBlank())) city = memory == null ? null : memory.city();
        if (directions) {
            if (slots != null && slots.origin()!=null && !slots.origin().isBlank()) nearby=NearbyLocation.requested(slots.origin(),null);
            else if (state!=null && state.lastDirections()!=null && state.lastDirections().originQuery()!=null)
                nearby=NearbyLocation.requested(state.lastDirections().originQuery(),null);
        }
        return new Understanding(new IntentAnalysis(intent, city, filters.maxBudgetPerNight(), filters.starRating(),
                filters.adults(), filters.children(), filters.checkIn(), filters.checkOut(), filters.amenities(), filters.hotelNames(), filters.bookingCode(), filters.roomCriteria(), nearby), decision, action);
    }

    private boolean lastSearchWasHotels(AssistantRequest request) {
        if (request.conversationContext() == null) return false;
        String last = request.conversationContext().lastIntent();
        return "RECOMMEND_HOTELS".equals(last) || "COMPARE_HOTELS".equals(last);
    }

    private String fallbackAction(String message) {
        String text = normalize(message);
        if (text.matches(".*(phong.*khac|xem (them|tiep).*phong).*")) return "MORE_ROOMS";
        if (text.matches(".*(lua chon|phuong an|cai).*(khac|nua).*")) return "MORE_OPTIONS";
        if (text.matches(".*(con khach san|khach san.*khac|xem them khach san|cho nghi.*khac).*")) return "MORE_HOTELS";
        if (text.matches(".*(kiem tra lai|cap nhat).*(gia|phong|ngay).*")) return "RECHECK_TRIP";
        if (text.matches("^(uu tien|duoi |ngan sach|re hon|them ).*")) return "REFINE_SEARCH";
        return "NONE";
    }

    public record Understanding(IntentAnalysis analysis, SemanticDecision semantic, String action, boolean planningUnavailable) {
        public Understanding(IntentAnalysis analysis,SemanticDecision semantic,String action){this(analysis,semantic,action,false);}
    }

    private static final Pattern STAR_PATTERN = Pattern.compile("(?i)([1-5])\\s*(?:sao|star)");
    private static final Pattern ISO_DATE_PATTERN = Pattern.compile("(20\\d{2}-\\d{2}-\\d{2})");
    private static final Pattern VN_DATE_PATTERN = Pattern.compile("(\\d{1,2})[/-](\\d{1,2})(?:[/-](20\\d{2}))?");

    public IntentAnalysis analyze(AssistantRequest request) {
        IntentAnalysis current = fallback(request);
        String question = normalize(request.message());
        boolean refinement = question.matches("^(uu tien|duoi |ngan sach|re hon|them |con khach san).*" )
                || question.matches(".*(vua (noi|tim)|o do|cho do|cac lua chon|hai khach san|2 khach san).*" );
        if (request.history() == null || !refinement) {
            return current;
        }
        if (!List.of("RECOMMEND_HOTELS", "COMPARE_HOTELS").contains(current.intent())) return current;
        IntentAnalysis previous = request.history().stream().filter(message -> "user".equals(message.role()))
                .map(message -> fallback(new AssistantRequest(message.content(), null, null, null, null, null, null)))
                .filter(intent -> "RECOMMEND_HOTELS".equals(intent.intent()))
                .reduce((first, second) -> second).orElse(null);
        if (previous == null) return current;
        return new IntentAnalysis(current.intent(), current.city() == null ? previous.city() : current.city(),
                current.maxBudgetPerNight() == null ? previous.maxBudgetPerNight() : current.maxBudgetPerNight(),
                current.starRating() == null ? previous.starRating() : current.starRating(),
                current.adults(), current.children(), current.checkIn(), current.checkOut(),
                current.amenities().isEmpty() ? previous.amenities() : current.amenities(), current.hotelNames(), current.bookingCode());
    }

    private IntentAnalysis fallback(AssistantRequest request) {
        String message = request.message();
        String normalized = normalize(message);
        boolean discovery = normalized.matches(".*(tim |goi y|de xuat|uu tien|muon dat phong).*" );
        List<LocalDate> dates = inferDates(message);
        String intent;
        if (normalized.contains("so sanh") || normalized.contains("compare")) {
            intent = "COMPARE_HOTELS";
        } else if (normalized.matches(".*(tom tat|review|danh gia|nhan xet).*" )
                && !normalized.matches(".*(viet|gui|sau khi).*" ) && !discovery) {
            intent = "REVIEW_SUMMARY";
        } else if (inferBookingCode(message) != null
                || normalized.matches(".*(cua toi|cua minh|con phai (tra|thanh toan)|da tra bao nhieu|da thanh toan bao nhieu).*" )
                && normalized.matches(".*(booking|don|dat phong|chuyen di|thanh toan|tra|nhan phong).*" )
                || normalized.matches(".*(booking|don dat phong) (sap toi|nao).*")) {
            intent = "MY_BOOKINGS";
        } else if (normalized.matches(".*(cach dat|huong dan dat|dat phong (nhu|the nao)|lam sao.*dat).*")) {
            intent = "GENERAL";
        } else if (!discovery && normalized.matches(".*(khach san nay|phong nay|gia phong|gia bao nhieu|tien nghi|dia chi|so dien thoai|may gio|con phong).*")) {
            intent = "HOTEL_DETAILS";
        } else if (new SystemKnowledgeService().lookup(message).isPresent()
                && !discovery && !normalized.matches(".*khach san.*(cho |duoi |tai |o ).*")) {
            intent = "GENERAL";
        } else if (normalized.matches(".*(khach san|dat phong|tim phong|tim cho|goi y|phong cho|o dau|ngan sach|gia dinh|vo chong|cung vo|cung chong|voi vo|voi chong|va con|uu tien).*" )
                || inferCity(message) != null || inferMoney(message) != null || !inferAmenities(message).isEmpty()) {
            intent = "RECOMMEND_HOTELS";
        } else {
            intent = "GENERAL";
        }

        return new IntentAnalysis(
                intent,
                inferCity(message),
                inferMoney(message),
                inferStars(message),
                inferPeople(message) != null ? inferPeople(message) : request.adults(),
                inferChildren(message) != null ? inferChildren(message) : request.children(),
                dates.isEmpty() ? request.checkIn() : dates.get(0),
                dates.isEmpty() ? request.checkOut() : dates.size() > 1 ? dates.get(1) : null,
                inferAmenities(message),
                List.of(),
                inferBookingCode(message)
        );
    }

    private String inferCity(String message) {
        List<String> known = List.of("Đà Lạt", "Hồ Chí Minh", "TP.HCM", "Hà Nội", "Đà Nẵng", "Nha Trang", "Vũng Tàu", "Phú Quốc", "Huế", "Hội An", "Quy Nhơn", "Cần Thơ", "Sa Pa", "Hạ Long", "Phan Thiết", "Bắc Ninh", "Hải Phòng", "Vinh", "Buôn Ma Thuột");
        String normalized = normalize(message);
        if (normalized.matches(".*(?:hcm|sai gon|tp[. ]*hcm).*")) return "Hồ Chí Minh";
        String city = known.stream().filter(name -> Pattern.compile("\\b" + Pattern.quote(normalize(name)) + "\\b").matcher(normalized).find()).findFirst().orElse(null);
        if (city != null) return city;
        // Whole-word prepositions only: the final "o" in "vo" is not the word "o".
        Matcher location = Pattern.compile("(?:^|[\\s,;])(?:tai|o|gan)\\s+([a-z0-9 .]{2,60}?)(?=\\s+(?:cho|duoi|co|voi|ngan sach|gia|tu|ngay)\\b|[,!?]|$)").matcher(normalized);
        if (!location.find()) return null;
        String candidate = location.group(1).trim();
        if (candidate.matches("^(khach san|phong|cung|voi|toi|minh|vo|chong|con|gia dinh|day|do|gan|quanh|canh)(?:\\s.*)?")) return null;
        if (normalized.matches(".*\\b(gan|quanh|canh|near|around)\\s+.*")) return null;
        return candidate;
    }

    private BigDecimal inferMoney(String message) {
        String normalized = normalize(message);
        Matcher units = Pattern.compile("([0-9]+(?:[.,][0-9]+)?)\\s*(trieu|tr|nghin|ngan|k)(?:\\b|$)").matcher(normalized);
        if (units.find()) {
            BigDecimal amount = new BigDecimal(units.group(1).replace(',', '.'));
            return amount.multiply(BigDecimal.valueOf(units.group(2).startsWith("tr") ? 1_000_000 : 1_000));
        }
        // Require a currency or budget prefix so dates and booking IDs cannot become prices.
        Matcher money = Pattern.compile("(?:duoi|toi da|ngan sach|budget)\\s*([0-9][0-9., ]{3,})|([0-9][0-9., ]{3,})\\s*(?:vnd|dong|đ|d)(?:\\b|$)").matcher(normalized);
        if (!money.find()) return null;
        String digits = (money.group(1) != null ? money.group(1) : money.group(2)).replaceAll("[^0-9]", "");
        return digits.isEmpty() ? null : new BigDecimal(digits);
    }

    private Integer inferChildren(String message) {
        String text = normalize(message);
        Matcher matcher = Pattern.compile("(\\d{1,2}|mot|hai|ba|bon|nam)\\s*(?:tre em|tre|be|con|children|child)(?:\\b|$)").matcher(text);
        if (matcher.find()) return count(matcher.group(1));
        if (text.matches(".*\\b(con toi|con cua toi|mot dua con|mot em be)\\b.*")) return 1;
        return null;
    }

    private Integer inferPeople(String message) {
        String text = normalize(message);
        Matcher matcher = Pattern.compile("(\\d{1,2}|mot|hai|ba|bon|nam)\\s*(?:nguoi lon|nguoi|khach(?!\\s+san)|adults?)(?:\\b|$)").matcher(text);
        if (matcher.find()) {
            int total = count(matcher.group(1));
            Integer children = inferChildren(message);
            if (children != null && !matcher.group().contains("nguoi lon") && text.matches(".*(gom|trong do|bao gom).*")) return Math.max(1, total - children);
            return total;
        }
        if (text.matches(".*\\b(vo chong|cung vo|cung chong|voi vo|voi chong)\\b.*")) return 2;
        return null;
    }

    private int count(String value) {
        return switch (value) {
            case "mot" -> 1;
            case "hai" -> 2;
            case "ba" -> 3;
            case "bon" -> 4;
            case "nam" -> 5;
            default -> Integer.parseInt(value);
        };
    }

    private Integer inferStars(String message) {
        Matcher matcher = STAR_PATTERN.matcher(message);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : null;
    }

    private List<LocalDate> inferDates(String message) {
        List<LocalDate> dates = new ArrayList<>();
        Matcher iso = ISO_DATE_PATTERN.matcher(message);
        while (iso.find()) {
            try {
                dates.add(LocalDate.parse(iso.group(1)));
            } catch (DateTimeParseException invalid) {
                throw new IllegalArgumentException("Ngày lưu trú không hợp lệ. Hãy nhập ngày theo dạng ngày/tháng/năm.", invalid);
            }
        }
        if (!dates.isEmpty()) return dates;

        Matcher vn = VN_DATE_PATTERN.matcher(message);
        while (vn.find()) {
            int day = Integer.parseInt(vn.group(1));
            int month = Integer.parseInt(vn.group(2));
            int year = vn.group(3) == null ? LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).getYear() : Integer.parseInt(vn.group(3));
            try {
                dates.add(LocalDate.of(year, month, day));
            } catch (java.time.DateTimeException invalid) {
                throw new IllegalArgumentException("Ngày lưu trú không hợp lệ. Hãy nhập ngày theo dạng ngày/tháng/năm.", invalid);
            }
        }
        return dates;
    }

    private List<String> inferAmenities(String message) {
        String normalized = normalize(message);
        List<String> amenities = new ArrayList<>();
        if (normalized.contains("ho boi") || normalized.contains("be boi") || normalized.contains("pool")) amenities.add("Hồ bơi");
        if (normalized.contains("wifi") || normalized.contains("wi-fi")) amenities.add("WiFi");
        if (normalized.contains("spa")) amenities.add("Spa");
        if (normalized.contains("gym") || normalized.contains("phong tap")) amenities.add("Phòng gym");
        if (normalized.contains("do xe") || normalized.contains("bai xe")) amenities.add("Bãi đỗ xe");
        if (normalized.contains("an sang") || normalized.contains("breakfast")) amenities.add("Bữa sáng");
        return amenities;
    }

    private String inferBookingCode(String message) {
        Matcher matcher = Pattern.compile("(?i)(EZR-[A-Z0-9-]+)").matcher(message);
        return matcher.find() ? matcher.group(1).toUpperCase(Locale.ROOT) : null;
    }

    private String normalize(String value) {
        if (value == null) return "";
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
        return normalized.replaceAll("\\s+", " ").trim();
    }

}
