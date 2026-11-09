package com.smarthotel.ai.assistant.v2.service;
import com.smarthotel.ai.assistant.v2.dto.AssistantRequest;
final class GeographicQuery {
    private GeographicQuery() {}
    static boolean coordinates(String message) {
        String text=SystemKnowledgeService.normalize(message);
        return text.matches(".*\\b(toa do|vi do|kinh do|gps|coordinates?|latitude|longitude)\\b.*") && !text.matches(".*\\b(khong can|dung|do not)\\s+(?:xem\\s+)?(?:toa do|gps|coordinates?)\\b.*");
    }
    static boolean reference(String message) {
        String text=SystemKnowledgeService.normalize(message);
        return !text.matches(".*\\b(tim|can|muon|so sanh|doi chieu|compare|dat phong|thanh toan|gia bao nhieu|muc gia|phong nao|loai phong|danh gia|chat luong|dich vu|tien nghi|dien thoai|dia chi|gio nhan|gio tra|review|phone|address|facilities|chi duong|duong di|xuat phat|directions|route)\\b.*") && (text.matches(".*\\b(hotel|khach san|do|nay|day)\\b.*") || text.strip().matches("\\d{1,3}"));
    }
    static boolean coordinates(AssistantRequest request) {
        if(coordinates(request.message())) return true;
        if(!reference(request.message())) return false;
        var state=request.conversationContext();
        if(state!=null && "DIRECTIONS".equals(state.lastIntent()) && state.lastDirections()!=null && state.lastDirections().coordinatesOnly()) return true;
        var history=request.history();
        if(history!=null) for(int i=history.size()-1;i>=0;i--) {
            var turn=history.get(i);
            if(turn==null || !"user".equals(turn.role()) || turn.content()==null) continue;
            if(coordinates(turn.content())) return true;
            if(!reference(turn.content())) return false;
        }
        return false;
    }
}
