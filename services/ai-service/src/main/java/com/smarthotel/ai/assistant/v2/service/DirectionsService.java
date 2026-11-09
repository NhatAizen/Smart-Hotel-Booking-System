package com.smarthotel.ai.assistant.v2.service;

import com.smarthotel.ai.assistant.v2.dto.*;
import com.smarthotel.ai.integration.hotel.HotelClient;
import com.smarthotel.ai.integration.hotel.dto.HotelResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Publishes map links from verified locations; it never fabricates road routes or ETAs. */
final class DirectionsService {
    record Reply(String answer, AssistantDirections directions, List<String> suggestions) {}
    private final HotelClient hotels;
    private final LandmarkResolver places;
    DirectionsService(HotelClient hotels, LandmarkResolver places) {this.hotels=hotels;this.places=places;}

    Reply answer(AssistantRequest request, IntentAnalysis analysis) {
        var state=request.conversationContext();
        var catalog=hotels.getHotels().stream().filter(h->h.id()!=null && (h.status()==null || h.status().isBlank() || "ACTIVE".equalsIgnoreCase(h.status()))).toList();
        var route=state==null?null:state.lastDirections();
        List<UUID> ids=state==null || state.hotelIds()==null?List.of():state.hotelIds();
        if(ids.isEmpty() && route!=null && route.destinationIds()!=null) ids=route.destinationIds();
        if(state!=null && List.of("ROOM_RECOMMEND","ROOM_COMPARE").contains(Objects.toString(state.lastIntent(),"")) && state.roomHotelId()!=null) ids=List.of(state.roomHotelId());
        var byId=catalog.stream().collect(Collectors.toMap(HotelResponse::id,h->h,(a,b)->a));
        var roster=ids.stream().distinct().map(byId::get).filter(Objects::nonNull).toList();
        String text=SystemKnowledgeService.normalize(request.message());
        boolean coordinatesOnly=GeographicQuery.coordinates(request);
        var endpoints=endpoints(text);
        boolean reverse=route!=null && route.hotelAtOrigin();
        String hotelText=text;
        String landmarkQuery=null;
        if(coordinatesOnly) {
            var joined=Pattern.compile("\\s+(?:voi|va|cung|and)\\s+(.+)$").matcher(text);
            if(joined.find()) {hotelText=text.substring(0,joined.start());landmarkQuery=joined.group(1).replaceAll("\\s+(?:di|nhe|voi|please)[.!? ]*$","").strip();}
        }
        if(endpoints!=null) {
            boolean fromHotel=!named(endpoints.from(),catalog,roster).isEmpty() || hotelReference(endpoints.from());
            boolean toHotel=!named(endpoints.to(),catalog,roster).isEmpty() || hotelReference(endpoints.to());
            reverse=fromHotel && !toHotel;
            hotelText=reverse?endpoints.from():endpoints.to();
            landmarkQuery=(reverse?endpoints.to():endpoints.from()).replaceAll("(?:\\s+(?:xem thu|giup toi|giup minh|nhe|nha|di|voi|please))+[.!? ]*$","").strip();
        }
        var named=named(hotelText,catalog,roster);
        // Never parse FROM or a landmark's code/address as a hotel ordinal.
        var positions=hotelText.strip().matches("\\d{1,3}[.!]?")
                ? List.of(Integer.parseInt(hotelText.strip().replaceAll("[.!]$",""))-1):OptionReferences.positions(hotelText);
        if(!named.isEmpty()) positions=List.of();
        boolean hotelSelection=endpoints==null && (!named.isEmpty() || !positions.isEmpty());
        boolean invalidPosition=false;
        List<HotelResponse> selected;
        if(!positions.isEmpty()) {
            var selectedIds=OptionReferences.resolve(positions,ids);
            selected=selectedIds.stream().map(byId::get).filter(Objects::nonNull).toList();
            invalidPosition=selectedIds.isEmpty() || selected.size()!=selectedIds.size();
        } else if(!named.isEmpty()) selected=named;
        else if("DIRECTIONS".equals(state==null?null:state.lastIntent()) && route!=null && !route.hotelChoiceRequired()
                && route.destinationIds()!=null && route.destinationIds().size()==1 && byId.containsKey(route.destinationIds().get(0))) selected=List.of(byId.get(route.destinationIds().get(0)));
        else if(!roster.isEmpty()) selected=roster;
        else if(request.hotelId()!=null && byId.containsKey(request.hotelId())) selected=List.of(byId.get(request.hotelId()));
        else selected=List.of();
        boolean choice=invalidPosition || selected.size()>1 && named.isEmpty() && positions.isEmpty() && !OptionReferences.wholeRoster(request.message());
        if(invalidPosition) selected=roster;
        NearbyLocation requested=landmarkQuery==null?hotelSelection?null:analysis.nearby():NearbyLocation.requested(landmarkQuery,null);
        if(requested==null && route!=null && route.originQuery()!=null && !route.originQuery().isBlank()) requested=NearbyLocation.requested(route.originQuery(),null);
        if(requested==null && state!=null && state.lastHotelSearch()!=null && state.lastHotelSearch().nearby()!=null)
            requested=NearbyLocation.requested(state.lastHotelSearch().nearby().query(),null);
        if(selected.isEmpty()) return new Reply("Bạn muốn chỉ đường cho khách sạn nào? Hãy chọn khách sạn trên EnziuRooms hoặc cho tôi tên khách sạn.",new AssistantDirections(requested,List.of(),true,true,reverse),List.of());
        String city=analysis.city();
        if(city==null && state!=null && state.lastHotelSearch()!=null) city=state.lastHotelSearch().city();
        if(city==null) {
            var cities=selected.stream().map(HotelResponse::city).filter(Objects::nonNull).distinct().toList();
            if(cities.size()==1) city=cities.get(0);
        }
        NearbyLocation origin=requested;
        String originError=null;
        if(requested!=null) {
            var hotelPlaces=named(SystemKnowledgeService.normalize(requested.query()),catalog,roster);
            if(hotelPlaces.size()==1) {
                var hotel=hotelPlaces.get(0);
                origin=new NearbyLocation(requested.query(),null,hotel.name(),hotel.latitude(),hotel.longitude(),null);
                originError="Khách sạn "+hotel.name()+" chưa có tọa độ để mở đường đi.";
            } else {
                var resolved=places.resolve(NearbyLocation.requested(requested.query(),requested.radiusKm()),city);
                if("FOUND".equals(resolved.status())) origin=resolved.choices().get(0);
                else originError="UNAVAILABLE".equals(resolved.status())?"Chưa truy xuất được vị trí địa điểm. Bạn có thể thử lại hoặc cho biết địa chỉ đầy đủ."
                        :"Tôi chưa xác định chắc "+(reverse?"điểm đến ":"điểm xuất phát ")+requested.query()+". Bạn cho biết tên đầy đủ, địa chỉ hoặc tỉnh/thành nhé.";
            }
        }
        final NearbyLocation point=origin;
        boolean originRequired=point==null || !LandmarkResolver.valid(point.latitude(),point.longitude());
        final boolean hotelAtOrigin=reverse;
        var destinations=selected.stream().map(h->{
            String address=java.util.stream.Stream.of(h.address(),h.ward(),h.district(),h.city()).filter(s->s!=null&&!s.isBlank()).distinct().collect(Collectors.joining(", "));
            String target=LandmarkResolver.valid(h.latitude(),h.longitude())?h.latitude()+","+h.longitude():null;
            String landmark=originRequired?null:point.latitude()+","+point.longitude();
            String url=originRequired || target==null?null:"https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route="+encode(hotelAtOrigin?target+";"+landmark:landmark+";"+target);
            return new AssistantDirections.Destination(h.id(),h.name(),address,url!=null&&url.length()<=2048?url:null);
        }).toList();
        boolean hasRoutes=destinations.stream().anyMatch(d->d.mapsUrl()!=null);
        String names=selected.stream().map(HotelResponse::name).collect(Collectors.joining("; "));
        String answer;
        if(invalidPosition) answer="Số thứ tự đó không có trong danh sách vừa hiển thị. Bạn chọn khách sạn theo tên bên dưới nhé.";
        else if(choice) answer="Bạn muốn "+(reverse?"xuất phát từ":"đi đến")+" khách sạn nào: "+names+"? "+(originRequired?"":(reverse?"Điểm đến giữ ":"Điểm xuất phát giữ ")+point.displayName()+". Bạn có thể mở đường đi của từng khách sạn bên dưới.");
        else answer=originRequired?"Tôi đã xác định khách sạn "+(reverse?"xuất phát: ":"đến: ")+names+".":hasRoutes?"Đường đi từ "+(reverse?names+" đến "+point.displayName():point.displayName()+" đến "+names)+" ở nút bên dưới.":"Địa chỉ của "+names+" ở bên dưới.";
        if(originRequired) answer+=" "+(requested==null?(reverse?"Bạn muốn đi đến đâu?":"Bạn muốn xuất phát từ đâu?"):originError);
        else if(hasRoutes) answer+=" Nhấn Xem đường đi trên bản đồ để xem tuyến và thời gian ước tính ngay trong EnziuRooms.";
        if(destinations.stream().anyMatch(d->d.mapsUrl()==null) && !originRequired) answer+=" Một số khách sạn chưa có tọa độ để mở đường đi trên OpenStreetMap.";
        var suggestions=choice?selected.stream().limit(8).map(HotelResponse::name).toList():List.<String>of();
        if(coordinatesOnly) {
            var facts=new ArrayList<String>();
            if(invalidPosition) facts.add("Số thứ tự đó không có trong danh sách vừa hiển thị. Bạn chọn khách sạn theo tên nhé.");
            else if(choice) facts.add("Bạn muốn xem tọa độ khách sạn nào: "+names+"?");
            else for(var hotel:selected) facts.add(coordinateFact(hotel.name(),hotel.latitude(),hotel.longitude()));
            if(point!=null) facts.add(coordinateFact(point.displayName()==null?point.query():point.displayName(),point.latitude(),point.longitude()));
            return new Reply(String.join("\n",facts),new AssistantDirections(origin,destinations,choice,originRequired,reverse,true),suggestions);
        }
        return new Reply(answer,new AssistantDirections(origin,destinations,choice,originRequired,reverse),suggestions);
    }
    private Reply reply(String answer,NearbyLocation origin,List<AssistantDirections.Destination> destinations,boolean choice,boolean originRequired,List<String> suggestions) {
        return new Reply(answer,new AssistantDirections(origin,destinations,choice,originRequired),suggestions);
    }
    private String encode(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8);}
    private String coordinateFact(String name,Double lat,Double lon) {
        return LandmarkResolver.valid(lat,lon)?name+": vĩ độ "+lat+", kinh độ "+lon+".":name+": chưa có tọa độ được xác minh.";
    }
    private record Endpoints(String from,String to) {}
    private Endpoints endpoints(String text) {
        var match=Pattern.compile("\\b(?:tu|from)\\s+(.+?)\\s+(?:den|toi|to)\\s+(.+)$").matcher(text);
        if(match.find()) return new Endpoints(match.group(1),match.group(2));
        match=Pattern.compile("\\b(?:den|toi|to)\\s+(.+?)\\s+(?:tu|from)\\s+(.+)$").matcher(text);
        return match.find()?new Endpoints(match.group(2),match.group(1)):null;
    }
    private boolean hotelReference(String text) {
        return text.matches("(?:khach san |hotel )?(?:do|day|nay|vua roi|that|there|it)[.!? ]*")
                || OptionReferences.explicitPositions(text) && text.matches("^(?:khach san|ks|hotel|cai|lua chon|phuong an|thu|so|#)\\b.*") || text.matches("\\d{1,3}[.!? ]*");
    }
    private List<HotelResponse> named(String text,List<HotelResponse> catalog,List<HotelResponse> roster) {
        var names=catalog.stream().filter(h->h.name()!=null && text.contains(SystemKnowledgeService.normalize(h.name()))).toList();
        if(!names.isEmpty()) return names;
        var generic=Set.of("hotel","khach","san","resort","saigon","city","garden","park","boutique","residence","riverside","central","luxury");
        var shortMatches=roster.stream().filter(h->h.name()!=null && Arrays.stream(SystemKnowledgeService.normalize(h.name()).split("[^a-z0-9]+"))
                .filter(word->word.length()>=4&&!generic.contains(word))
                .anyMatch(word->Pattern.compile("\\b"+Pattern.quote(word)+"\\b").matcher(text).find())).toList();
        return shortMatches.size()==1?shortMatches:List.of();
    }
}
