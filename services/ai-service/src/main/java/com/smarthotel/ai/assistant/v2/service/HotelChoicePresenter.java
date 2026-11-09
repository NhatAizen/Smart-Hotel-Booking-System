package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.AssistantHotelCard;
import com.smarthotel.ai.assistant.v2.dto.IntentAnalysis;
import java.util.*;
import java.util.function.ToIntFunction;

/** Advice is computed from published facts, never from generated hotel claims. */
final class HotelChoicePresenter {
    private HotelChoicePresenter() {}

    static String answer(List<AssistantHotelCard> hotels, IntentAnalysis trip) {
        var eligible = hotels.stream().filter(AssistantHotelCard::exactMatch).toList();
        if (eligible.isEmpty()) return "Chưa có khách sạn nào trong nhóm này đáp ứng đủ tiêu chí và phòng phù hợp để tôi ưu tiên. Bạn muốn đổi tiêu chí hay ngày ở?";
        String preference = trip.roomCriteria() == null ? "BALANCED" : trip.roomCriteria().preference();
        if (preference == null) preference = "BALANCED";
        if ("QUALITY".equals(preference)) {
            if (hotels.stream().anyMatch(h -> h.reviewCount() == null || h.reviewCount() == 0 || h.averageRating() == null))
                return "Chưa đủ đánh giá khách của các khách sạn vừa so sánh để ưu tiên nơi nào về chất lượng dịch vụ. Số sao và tiện nghi công bố chưa chứng minh trải nghiệm thực tế. Bạn muốn ưu tiên tiện nghi gia đình hay chi phí?";
            var ranked = eligible.stream().sorted(Comparator.comparing(AssistantHotelCard::averageRating).reversed()).toList();
            if (ranked.size() > 1 && ranked.get(0).averageRating().equals(ranked.get(1).averageRating()))
                return "Điểm đánh giá của các lựa chọn dẫn đầu bằng nhau; chưa có căn cứ ưu tiên một nơi về chất lượng. Bạn muốn xét thêm tiện nghi hay chi phí?";
            var best = ranked.get(0);
            return "Nếu ưu tiên điểm đánh giá khách, tôi nghiêng về " + best.name() + ": "
                    + String.format(Locale.US,"%.1f/10",best.averageRating()) + " từ " + best.reviewCount()
                    + " đánh giá. Đây là điểm trong dữ liệu hiện có, không bảo đảm mọi trải nghiệm đều tốt hơn.";
        }
        if ("CHEAPEST".equals(preference)) {
            if (eligible.stream().anyMatch(h -> h.pricePerNight() == null)) return "Chưa đủ giá của từng lựa chọn để xác định nơi tiết kiệm nhất.";
            var ordered = eligible.stream().sorted(Comparator.comparing(AssistantHotelCard::pricePerNight)).toList();
            var best = ordered.get(0);
            if (ordered.size() > 1 && best.pricePerNight().compareTo(ordered.get(1).pricePerNight()) == 0)
                return "Các lựa chọn dẫn đầu có cùng giá cơ bản. Bạn muốn ưu tiên tiện nghi hay đánh giá khách để chọn tiếp?";
            return "Nếu ưu tiên tiết kiệm, chọn " + best.name() + ": giá cơ bản "
                    + String.format(Locale.forLanguageTag("vi-VN"),"%,.0f ₫",best.pricePerNight())
                    + "/phòng/đêm, thấp nhất trong nhóm đủ tiêu chí. Giá theo ngày và ưu đãi cần xác nhận khi chọn phòng.";
        }
        if ("LARGEST".equals(preference)) return "Chưa có diện tích phòng để xác định lựa chọn rộng nhất; sức chứa không thay thế được diện tích. Bạn muốn chọn theo tiện nghi hay chi phí?";
        boolean family = "FAMILY".equals(preference) || "BALANCED".equals(preference) && trip.children() != null && trip.children() > 0;
        ToIntFunction<AssistantHotelCard> score = "BREAKFAST".equals(preference) ? h -> Boolean.TRUE.equals(h.breakfastIncluded()) ? 1 : 0
                : "REFUNDABLE".equals(preference) ? h -> Boolean.TRUE.equals(h.refundable()) ? 1 : 0
                : family ? h -> familyFeatures(h).size() : h -> 0;
        var ranked = eligible.stream().sorted(Comparator.comparingInt(score).reversed()).toList();
        var best = ranked.get(0);
        if (score.applyAsInt(best) == 0 || ranked.size() > 1 && score.applyAsInt(best) == score.applyAsInt(ranked.get(1)))
            return "Trong các khách sạn vừa so sánh, chưa có lợi thế rõ theo tiêu chí này để ưu tiên một nơi. Bạn ưu tiên chi phí, tiện nghi gia đình, bữa sáng hay hoàn tiền?";
        String reason = family ? "có " + String.join(", ",familyFeatures(best)) + " trong thông tin công bố"
                : "BREAKFAST".equals(preference) ? "loại phòng đối chiếu có bao gồm bữa sáng" : "loại phòng đối chiếu có hoàn tiền theo điều kiện phòng";
        return (family ? trip.children() != null && trip.children() > 0 ? "Với chuyến đi có trẻ em, tôi ưu tiên " : "Nếu ưu tiên tiện nghi gia đình, tôi chọn " : "Theo tiêu chí bạn hỏi, tôi ưu tiên ") + best.name() + " vì " + reason
                + ". Đây là lợi thế về " + (family ? "tiện nghi gia đình" : "quyền lợi phòng")
                + "; chưa đủ căn cứ khẳng định dịch vụ tốt hơn."
                + (!best.availabilityChecked() ? " Chưa kiểm tra phòng trống; cần ngày ở để xác nhận." : "");
    }

    private static List<String> familyFeatures(AssistantHotelCard hotel) {
        var result = new ArrayList<String>();
        for (String value : hotel.amenities() == null ? List.<String>of() : hotel.amenities()) {
            if (SystemKnowledgeService.normalize(value).matches(".*\\b(ho boi|be boi|pool|nha hang|restaurant|khu vui choi|playground)\\b.*")) result.add(value);
        }
        if (Boolean.TRUE.equals(hotel.breakfastIncluded())) result.add("bữa sáng kèm phòng");
        if (Boolean.TRUE.equals(hotel.refundable())) result.add("hoàn tiền theo điều kiện phòng");
        return result.stream().distinct().toList();
    }
}
