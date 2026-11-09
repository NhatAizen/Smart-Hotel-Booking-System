package com.smarthotel.ai.assistant.v2.service;

import java.util.Set;

/** Region identity is separate from a POI name, including English map-provider labels. */
final class CityNames {
    private CityNames() {}
    private static final Set<String> CITIES=Set.of("da lat","ho chi minh","ha noi","da nang","nha trang","vung tau","phu quoc","hue","hoi an","quy nhon","can tho","sa pa","ha long","phan thiet","bac ninh","hai phong","vinh","buon ma thuot");
    static String canonical(String value) {
        String text=SystemKnowledgeService.normalize(value).replaceFirst("^(?:thanh pho|tinh|tp\\.?)\\s+","").replaceFirst("\\s+(?:city|province)$","").strip();
        if(text.matches("sai gon|saigon|hcm|tphcm|tp[. ]*hcm")) return "ho chi minh";
        if(text.equals("hanoi")) return "ha noi";
        if(text.equals("danang")) return "da nang";
        return text;
    }
    static boolean same(String left,String right) {return !canonical(left).isBlank() && canonical(left).equals(canonical(right));}
    static boolean regionOnly(String value) {return CITIES.contains(canonical(value)) || canonical(value).matches("(?:quan|huyen|phuong|thi xa)\\s+.+");}
    static boolean inAddress(String address,String hint) {
        String region=canonical(hint);
        return !region.isBlank() && java.util.regex.Pattern.compile("\\b"+java.util.regex.Pattern.quote(region)+"\\b").matcher(canonical(address)).find();
    }
}
