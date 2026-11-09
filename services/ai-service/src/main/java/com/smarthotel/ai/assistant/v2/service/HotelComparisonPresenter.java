package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.AssistantHotelCard;
import com.smarthotel.ai.assistant.v2.dto.AssistantHotelComparison;
import java.util.*;
import java.util.function.Function;

/** Comparison dimensions are facts, never inferred service-quality scores. */
final class HotelComparisonPresenter {
    private HotelComparisonPresenter() {}
    static boolean hasFocus(String message) {
        return SystemKnowledgeService.normalize(message).matches(".*\\b(chat luong|dich vu|trai nghiem|tien nghi|loi ich|quyen loi|sach se|phuc vu|danh gia|review|gia|chi phi)\\b.*");
    }
    static String focus(String message) {
        String text=SystemKnowledgeService.normalize(message);
        if(text.matches(".*\\b(chat luong|dich vu|trai nghiem|sach se|phuc vu|danh gia|review)\\b.*")) return "QUALITY";
        if(text.matches(".*\\b(gia|chi phi|tien phong)\\b.*")) return "PRICE";
        return "ALL";
    }
    static AssistantHotelComparison build(String message,List<AssistantHotelCard> hotels) {
        String focus=focus(message);
        var rows=new ArrayList<AssistantHotelComparison.Row>();
        add(rows,hotels,"Sao công bố",h->h.starRating()==null?"Chưa công bố":h.starRating()+" sao");
        add(rows,hotels,"Vị trí",h->join(h.address(),h.city()));
        add(rows,hotels,"Tiện nghi công bố",h->h.amenities()==null||h.amenities().isEmpty()?"Chưa cung cấp":String.join(", ",h.amenities()));
        add(rows,hotels,"Loại phòng đối chiếu",h->known(h.roomTypeName()));
        add(rows,hotels,"Sức chứa",h->h.maxAdults()==null?"Chưa cung cấp":h.maxAdults()+" người lớn"+(h.maxChildren()==null?"; chưa rõ số trẻ em":" và "+h.maxChildren()+" trẻ em"));
        add(rows,hotels,"Bữa sáng (loại phòng)",h->benefit(h.breakfastIncluded(),"Có bao gồm","Không bao gồm"));
        add(rows,hotels,"Hoàn tiền (loại phòng)",h->benefit(h.refundable(),"Có, theo điều kiện phòng","Không áp dụng"));
        add(rows,hotels,"Đánh giá khách",h->h.reviewCount()==null||h.reviewCount()==0?"Chưa có đánh giá":(h.averageRating()==null?"Chưa có điểm":String.format(Locale.US,"%.1f/10",h.averageRating()))+" · "+h.reviewCount()+" đánh giá");
        if(!"QUALITY".equals(focus)) add(rows,hotels,"Giá cơ bản / đêm",h->h.pricePerNight()==null?"Chưa có giá":String.format(Locale.forLanguageTag("vi-VN"),"%,.0f ₫",h.pricePerNight()));
        add(rows,hotels,"Phòng trống theo ngày",h->!h.availabilityChecked()?"Chưa kiểm tra":h.availableRooms()==null?"Chưa xác nhận":h.availableRooms()+" phòng");
        String note=hotels.stream().anyMatch(h->h.reviewCount()==null||h.reviewCount()==0)
                ? "Chưa đủ đánh giá khách để kết luận khách sạn nào có dịch vụ tốt hơn. Số sao và tiện nghi là thông tin công bố."
                : "Đánh giá dựa trên số lượt khách hiển thị. Số sao và tiện nghi là thông tin công bố.";
        if(!"QUALITY".equals(focus)) note+=" Giá cơ bản chưa gồm ưu đãi; giá cuối cùng xem khi chọn phòng.";
        return new AssistantHotelComparison(focus,List.copyOf(rows),note);
    }
    private static void add(List<AssistantHotelComparison.Row> rows,List<AssistantHotelCard> hotels,String label,Function<AssistantHotelCard,String> value) {
        rows.add(new AssistantHotelComparison.Row(label,hotels.stream().map(value).toList()));
    }
    private static String benefit(Boolean value,String yes,String no) {return value==null?"Chưa cung cấp":value?yes:no;}
    private static String known(String value) {return value==null||value.isBlank()?"Chưa cung cấp":value;}
    private static String join(String a,String b) {return java.util.stream.Stream.of(a,b).filter(v->v!=null&&!v.isBlank()).distinct().collect(java.util.stream.Collectors.joining(", "));}
}
