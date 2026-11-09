package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;

/** Compositional constraints and reference handling, shared by all search workflows. */
final class DialoguePolicy {
    private DialoguePolicy() {}
    private static String text(String value) { return SystemKnowledgeService.normalize(value); }
    private static final Set<String> AMENITIES = Set.of("Hồ bơi", "WiFi", "Bữa sáng", "Bãi đỗ xe", "Phòng gym", "Spa", "Điều hòa");

    static boolean roomListRequested(String message) {
        String value = text(message);
        return Pattern.compile("\\b(?:xem|liet ke|show|list)\\s+(?:me\\s+)?(?:(?:cac|nhung|danh sach|all|the|available)\\s+)?(?:(?:loai|types? of)\\s+)?(?:phong|rooms?)\\b")
                .matcher(value).find() || Pattern.compile("\\b(?:(?:cac|nhung)\\s+)?(?:loai\\s+)?phong\\s+nao\\b").matcher(value).find()
                || Pattern.compile("\\b(?:what|which)\\s+(?:types?\\s+of\\s+)?rooms?\\b").matcher(value).find();
    }

    static IntentAnalysis explicitSlots(IntentAnalysis current, SemanticDecision decision) {
        var slots = decision == null ? null : decision.slots();
        if (slots == null) return current;
        // The validated parser's explicit slots take precedence over guesses from
        // free-text prepositions (for example an abstract "ở ..." follow-up).
        String city = slots.city() == null || slots.city().isBlank() || slots.city().length() > 80 ? null : slots.city().strip();
        if (city != null && text(city).matches("(sai gon|hcm|tp[. ]*hcm|ho chi minh)")) city = "Hồ Chí Minh";
        List<String> amenities = slots.amenitiesAdd() == null ? new ArrayList<>(current.amenities())
                : slots.amenitiesAdd().stream().filter(AMENITIES::contains).distinct().collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        if (slots.amenitiesRemove() != null) amenities.removeAll(slots.amenitiesRemove());
        return new IntentAnalysis(current.intent(), city, validBudget(slots.budget()) ? slots.budget() : current.maxBudgetPerNight(),
                inRange(slots.starRating(),1,5) ? slots.starRating() : current.starRating(),
                inRange(slots.adults(),1,20) ? slots.adults() : current.adults(), inRange(slots.children(),0,20) ? slots.children() : current.children(),
                current.checkIn(), current.checkOut(), amenities, current.hotelNames(), current.bookingCode(), current.roomCriteria());
    }

    static IntentAnalysis slotEdits(IntentAnalysis filters, SemanticDecision decision) {
        var slots = decision == null ? null : decision.slots();
        if (slots == null) return filters;
        List<String> amenities = new ArrayList<>(filters.amenities());
        if (slots.amenitiesRemove() != null) amenities.removeAll(slots.amenitiesRemove());
        if (slots.amenitiesAdd() != null) slots.amenitiesAdd().stream().filter(AMENITIES::contains).filter(item -> !amenities.contains(item)).forEach(amenities::add);
        BigDecimal budget = filters.maxBudgetPerNight();
        if (Boolean.TRUE.equals(slots.clearBudget())) budget = null;
        else if (validBudget(slots.budget())) {
            budget = slots.budget();
            if ("TOTAL".equals(slots.budgetScope()) && filters.checkIn() != null && filters.checkOut() != null) {
                long nights = ChronoUnit.DAYS.between(filters.checkIn(), filters.checkOut());
                if (nights > 0) budget = budget.divide(BigDecimal.valueOf(nights),0,RoundingMode.DOWN);
            }
        }
        var previous = filters.roomCriteria();
        boolean refundable = slots.refundableOnly() == null ? previous != null && previous.refundableOnly() : slots.refundableOnly();
        boolean breakfast = slots.breakfastOnly() == null ? previous != null && previous.breakfastOnly() : slots.breakfastOnly();
        String preference = decision.preference() == null ? "BALANCED" : decision.preference();
        if ("BALANCED".equals(preference) && previous != null && previous.preference() != null) preference = previous.preference();
        var roomCriteria = new AssistantRoomCriteria(refundable, breakfast, preference);
        return new IntentAnalysis(filters.intent(), filters.city(), budget, Boolean.TRUE.equals(slots.clearStars()) ? null : filters.starRating(),
                filters.adults(), filters.children(), filters.checkIn(), filters.checkOut(), amenities, filters.hotelNames(), filters.bookingCode(), roomCriteria);
    }

    private static boolean inRange(Integer value, int low, int high) { return value != null && value >= low && value <= high; }
    private static boolean validBudget(BigDecimal value) { return value != null && value.signum() >= 0 && value.compareTo(new BigDecimal("1000000000")) <= 0; }

    static boolean roomContext(AssistantRequest request) {
        var state = request.conversationContext();
        return state != null && List.of("ROOM_RECOMMEND", "ROOM_COMPARE").contains(Objects.toString(state.lastIntent(), ""))
                && Objects.equals(request.hotelId(), state.roomHotelId());
    }

    static boolean pendingLandmark(AssistantRequest request) {
        var state=request.conversationContext();
        var nearby=state==null || state.lastHotelSearch()==null ? null : state.lastHotelSearch().nearby();
        return state!=null && "RECOMMEND_HOTELS".equals(state.lastIntent()) && nearby!=null
                && (!LandmarkResolver.valid(nearby.latitude(),nearby.longitude()) || CityNames.regionOnly(nearby.query()));
    }

    static boolean cityReply(String message,String city) {
        if(city==null) return false;
        String value=text(message).replaceAll("[.!?,;]+$", "").strip();
        value=value.replaceFirst("\\s+(?:nhe|nha|a|thoi|di|vay)$", "");
        if(cityAlias(value).equals(cityAlias(city))) return true;
        value=value.replaceFirst("^(?:(?:toi|minh)\\s+)?(?:(?:muon|can|di)\\s+)?(?:(?:o|tai|la|thanh pho|tp\\.?)\\s+)*", "");
        return cityAlias(value).equals(cityAlias(city));
    }
    private static String cityAlias(String value) {
        return CityNames.canonical(value);
    }

    static int ordinal(String message) {
        var matcher = Pattern.compile("\\b(?:thu|so|lua chon|phuong an)\\s*(nhat|mot|hai|ba|1|2|3)\\b").matcher(text(message));
        if (!matcher.find()) return -1;
        return switch (matcher.group(1)) {
            case "nhat", "mot", "1" -> 0;
            case "hai", "2" -> 1;
            default -> 2;
        };
    }

    static boolean constraintEdit(String message) {
        return text(message).matches(".*\\b(bo|go|khong can|khong yeu cau|them|giu|khong gioi han)\\b.*")
                && text(message).matches(".*(ngan sach|gioi han|tien|gia|ho boi|wifi|bua sang|an sang|gym|spa|do xe|bai xe|sao).*");
    }

    static IntentAnalysis merge(AssistantRequest request, IntentAnalysis current, AssistantQueryContext memory, boolean structuredEdits) {
        String message = text(request.message());
        List<String> amenities = new ArrayList<>(memory == null || memory.amenities() == null ? List.of() : memory.amenities());
        // A positive addition keeps all other constraints. A removal changes only its own slot.
        for (String amenity : current.amenities()) {
            if (!structuredEdits && removes(message, amenity)) amenities.removeIf(item -> text(item).equals(text(amenity)));
            else if (!amenities.contains(amenity)) amenities.add(amenity);
        }
        if (!structuredEdits && message.matches(".*(bo|go|khong can|khong yeu cau).*(tat ca|moi).*(tien nghi|dieu kien).*")) amenities.clear();
        boolean clearBudget = !structuredEdits && message.matches(".*\\b(bo|go|khong can|khong gioi han|khong han che)\\b.*(ngan sach|gioi han (gia|tien)|muc gia).*");
        boolean clearStars = !structuredEdits && message.matches(".*\\b(bo|go|khong can|khong yeu cau)\\b.*(hang sao|so sao|[1-5] sao).*");
        BigDecimal budget = clearBudget ? null : current.maxBudgetPerNight() != null ? current.maxBudgetPerNight() : memory == null ? null : memory.maxBudgetPerNight();
        if (!structuredEdits && budget != null && current.maxBudgetPerNight() != null && totalBudget(message) && current.checkIn() != null && current.checkOut() != null) {
            long nights = ChronoUnit.DAYS.between(current.checkIn(), current.checkOut());
            if (nights > 0) budget = budget.divide(BigDecimal.valueOf(nights), 0, RoundingMode.DOWN);
        }
        return new IntentAnalysis(current.intent(), current.city() != null ? current.city() : memory == null ? null : memory.city(),
                budget, clearStars ? null : current.starRating() != null ? current.starRating() : memory == null ? null : memory.starRating(),
                current.adults() != null ? current.adults() : memory == null ? null : memory.adults(),
                current.children() != null ? current.children() : memory == null ? null : memory.children(),
                current.checkIn() == null && current.checkOut() == null && memory != null ? memory.checkIn() : current.checkIn(),
                current.checkIn() == null && current.checkOut() == null && memory != null ? memory.checkOut() : current.checkOut(),
                amenities, current.hotelNames(), current.bookingCode(), current.roomCriteria() != null ? current.roomCriteria() : memory == null ? null : memory.roomCriteria());
    }

    private static boolean removes(String message, String amenity) {
        String names = switch (amenity) {
            case "Hồ bơi" -> "(?:ho boi|be boi|pool)";
            case "Bữa sáng" -> "(?:bua sang|an sang|breakfast)";
            case "Bãi đỗ xe" -> "(?:do xe|bai xe)";
            case "Phòng gym" -> "(?:gym|phong tap)";
            default -> Pattern.quote(text(amenity));
        };
        return Pattern.compile("(?:bo|go|khong can|khong yeu cau)\\s+(?:(?:dieu kien|yeu cau|co|tien nghi)\\s+)*" + names).matcher(message).find();
    }

    static boolean totalBudget(String message) {
        return text(message).matches(".*(tong (chi phi|ngan sach|tien)|ca (chuyen|ky nghi)|cho (ca |toan bo )?[1-9]\\d* dem).*");
    }

    static String clarification(AssistantRequest request, IntentAnalysis analysis, String action) {
        String message = text(request.message());
        if ("MY_BOOKINGS".equals(analysis.intent()) && message.matches(".*(nguoi khac|tai khoan khac|khach khac).*"))
            return "Tôi chỉ tra cứu đơn của tài khoản đang đăng nhập. Bạn có thể xem đơn của mình trong mục Đặt phòng.";
        if ("CLARIFY".equals(analysis.intent())) {
            if (pendingLandmark(request))
                return "Bạn cho tôi tên đầy đủ của địa điểm, địa chỉ hoặc tỉnh/thành để tìm khách sạn ở gần nhé.";
            return "Bạn muốn tìm khách sạn, chọn phòng, so sánh hay hỏi về đơn đặt phòng? Hãy cho tôi biết nhu cầu cụ thể hơn.";
        }
        if (List.of("RECOMMEND_HOTELS", "ROOM_RECOMMEND", "ROOM_COMPARE", "COMPARE_HOTELS").contains(analysis.intent())) {
            if (totalBudget(message) && (analysis.checkIn() == null || analysis.checkOut() == null))
                return "Ngân sách này dành cho cả chuyến đi. Bạn cho tôi ngày nhận và trả phòng để tính giới hạn mỗi đêm nhé.";
            if (message.matches(".*\\b(khong co|khong duoc co|tranh)\\s+(ho boi|be boi|an sang|bua sang|spa|gym).*"))
                return "Bạn muốn bỏ yêu cầu tiện nghi đó hay bắt buộc nơi ở không có tiện nghi đó? Danh sách tiện nghi chưa đủ để xác nhận điều kiện không có.";
            if (message.matches(".*\\b([2-9]|hai|ba|bon|nam)\\s+phong\\b.*") && !"ROOM_COMPARE".equals(analysis.intent()))
                return "Bạn cần đặt nhiều phòng cùng lúc hay đang muốn so sánh các loại phòng? Tôi cần biết số phòng và số khách mỗi phòng để tìm đúng.";
        }
        if ("SELECT_OPTION".equals(action) && ordinal(message) < 0)
            return "Bạn muốn xem lựa chọn thứ mấy? Bạn cũng có thể cho tôi biết tên khách sạn hoặc loại phòng.";
        return null;
    }
}
