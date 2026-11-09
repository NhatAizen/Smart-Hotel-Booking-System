export function guestSummary(adults, children) {
  const grownups = Math.max(1, Number(adults) || 1);
  const kids = Math.max(0, Number(children) || 0);
  return `${grownups} người lớn${kids > 0 ? ` và ${kids} trẻ em` : ""}`;
}

export function hasLocalEngineMetadata(message) {
  return ["LOCAL_RULES_AND_SYSTEM_DATA", "LOCAL_SEMANTIC_AND_SYSTEM_DATA"].includes(message?.engine?.mode)
    && message.engine.externalModelUsed === false
    && message.engine.id === message.model
    && /^enziuroom-local-v\d+$/.test(message.model);
}

export function tripFromAssistant(current, context) {
  if (!context) return current;
  return {
    ...current,
    checkIn: context.checkIn ?? current.checkIn,
    checkOut: context.checkOut ?? current.checkOut,
    adults: context.adults ?? current.adults,
    children: context.children ?? current.children,
  };
}

export function recommendationLead(hotel, criteria, reasons) {
  const room = hotel.roomTypeName
    ? ` — ${/^phòng\b/iu.test(hotel.roomTypeName) ? "" : "phòng "}${hotel.roomTypeName}`
    : "";
  const fits = Number(hotel.maxAdults) >= criteria.adults
    && Number(hotel.maxChildren) >= criteria.children;
  const capacity = fits ? `đủ chỗ cho ${guestSummary(criteria.adults, criteria.children)}` : "";
  const facts = [capacity, ...reasons].filter(Boolean);
  return `Tôi gợi ý ${hotel.name}${room}${facts.length ? `: ${facts.join(", ")}` : ""}.`;
}

export function hotelResultsSummary(hotels, criteria, alternative = false) {
  const location = criteria.nearby ? ` trong bán kính ${Number(criteria.nearby.radiusKm).toLocaleString("vi-VN")} km quanh ${criteria.nearby.displayName} (đường chim bay), xếp gần trước,`
    : criteria.destination ? ` tại ${criteria.destination}` : "";
  const names = hotels.map((hotel) => hotel.name).filter(Boolean).join("; ");
  return `Tôi tìm được ${hotels.length} khách sạn${alternative ? " khác" : ""}${location} cho ${guestSummary(criteria.adults, criteria.children)}: ${names}. Giá và phòng trống của từng khách sạn ở các thẻ bên dưới.`;
}

export function assistantSuggestions(message, fallback = []) {
  const prompts = message?.suggestedPrompts?.length ? message.suggestedPrompts : fallback;
  const hotelResults = ["RECOMMEND_HOTELS", "COMPARE_HOTELS"].includes(message?.intent) || message?.hotels?.length;
  if (!hotelResults) return prompts;
  // Comparison remains available by asking; do not automatically suggest a pair.
  return prompts.filter((prompt) => !/(?:so sanh|compare)/.test(String(prompt).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
}

// Focus follows the final cards shown to the customer, including enrichment/filtering.
export function assistantHotelFocus(message) {
  if (message?.intent === "DIRECTIONS") {
    const destinations=message.directions?.destinations ?? [];
    return !message.directions?.hotelChoiceRequired && destinations.length===1 && destinations[0].hotelId
      ? {id:destinations[0].hotelId,name:destinations[0].name} : null;
  }
  const rooms = ["ROOM_RECOMMEND", "ROOM_COMPARE"].includes(message?.intent);
  if (!rooms && !["RECOMMEND_HOTELS", "HOTEL_DETAILS"].includes(message?.intent)) return null;
  const candidates = rooms ? message.rooms : message.hotels;
  const hotels = new Map((candidates ?? []).filter(item => item?.hotelId)
    .map(item => [item.hotelId, { id: item.hotelId, name: rooms ? item.hotelName : item.name }]));
  return hotels.size === 1 ? [...hotels.values()][0] : null;
}

// Search memory is built from cards actually displayed, independently of the shortened text history.
export function buildAssistantConversationContext(messages) {
  let shownHotelIds = [];
  let lastHotelSearch = null;
  let lastIntent = null;
  let roomTypeIds = [];
  let shownRoomIds = [];
  let lastRoomSearch = null;
  let roomHotelId = null;
  let hotelIds = [];
  let recommendedHotelIds = [];
  let lastDirections = null;
  for (const message of messages ?? []) {
    if (message.role !== "assistant") continue;
    if (message.intent === "RECOMMEND_HOTELS") {
      lastDirections = null;
      roomTypeIds = [];
      shownRoomIds = [];
      lastRoomSearch = null;
      roomHotelId = null;
      if (message.conversationAction !== "MORE_HOTELS") shownHotelIds = [];
      shownHotelIds = [...new Set([...shownHotelIds, ...(message.hotels ?? []).map((hotel) => hotel.hotelId).filter(Boolean)])];
      if (message.context) lastHotelSearch = message.context;
      lastIntent = message.intent;
      if (message.hotels?.length) {
        hotelIds = message.hotels.map((hotel) => hotel.hotelId).filter(Boolean).slice(0, 8);
        recommendedHotelIds = hotelIds;
      } else if (message.conversationAction !== "MORE_HOTELS") {
        // A failed new/refined search cannot refer back to another destination.
        hotelIds = [];
        recommendedHotelIds = [];
      }
    } else if (message.intent === "DIRECTIONS" && message.directions) {
      lastIntent = "DIRECTIONS";
      const destinations = (message.directions.destinations ?? []).map(item => item.hotelId).filter(Boolean).slice(0, 8);
      lastDirections = { originQuery:(message.directions.landmark ?? message.directions.origin)?.query ?? null, destinationIds:destinations,
        originResolved:!message.directions.originRequired, hotelChoiceRequired:Boolean(message.directions.hotelChoiceRequired), hotelAtOrigin:Boolean(message.directions.hotelAtOrigin), coordinatesOnly:Boolean(message.directions.coordinatesOnly) };
      if (!hotelIds.length && destinations.length) hotelIds = destinations;
    } else if (message.intent === "COMPARE_HOTELS") {
      lastIntent = message.intent;
      if (message.hotels?.length) hotelIds = message.hotels.map((hotel) => hotel.hotelId).filter(Boolean).slice(0, 8);
    } else if (["ROOM_RECOMMEND", "ROOM_COMPARE"].includes(message.intent)) {
      lastIntent = message.intent;
      const hotel = message.rooms?.[0]?.hotelId ?? message.agentContext?.currentHotelId;
      if ((!['MORE_ROOMS', 'SELECT_OPTION'].includes(message.conversationAction) && message.intent !== "ROOM_COMPARE") || (hotel && hotel !== roomHotelId)) shownRoomIds = [];
      shownRoomIds = [...new Set([...shownRoomIds, ...(message.rooms ?? []).map((room) => room.id).filter(Boolean)])];
      if (message.context) lastRoomSearch = message.context;
      if (hotel) roomHotelId = hotel;
    }
    if (message.rooms?.length) roomTypeIds = message.rooms.map((room) => room.id).filter(Boolean).slice(0, 8);
  }
  return { roomTypeIds, shownHotelIds: shownHotelIds.slice(0, 200), lastHotelSearch, lastIntent,
    shownRoomIds: shownRoomIds.slice(0, 200), lastRoomSearch, roomHotelId, hotelIds, recommendedHotelIds, lastDirections };
}

export function directionsUrl(value) {
  try {
    const url=new URL(value);
    if (url.username || url.password) return null;
    let points;
    if (url.origin==="https://www.openstreetmap.org" && url.pathname==="/directions" && url.searchParams.get("engine")==="fossgis_osrm_car") {
      points=(url.searchParams.get("route") ?? "").split(";");
    } else if (url.origin==="https://www.google.com" && url.pathname==="/maps/dir/" && url.searchParams.get("api")==="1") {
      // Existing conversations also open OSM; reuse coordinates, never geocode
      // an old free-text destination into a potentially different hotel.
      points=[url.searchParams.get("origin"),url.searchParams.get("destination")];
    } else return null;
    if (points.length!==2 || points.some(point => {
      if (!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?,-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(point ?? "")) return true;
      const [lat,lon]=point.split(",").map(Number);
      return !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || (lat===0 && lon===0);
    })) return null;
    const target=new URL("https://www.openstreetmap.org/directions");
    target.searchParams.set("engine","fossgis_osrm_car");
    target.searchParams.set("route",points.join(";"));
    return target.href;
  } catch { return null; }
}

export function assistantMapRoute(directions,hotel) {
  const url=directionsUrl(hotel?.mapsUrl);
  if(!url || !hotel?.hotelId || !hotel?.name) return null;
  const points=new URL(url).searchParams.get("route").split(";").map(point=>{
    const [lat,lng]=point.split(",").map(Number);
    return {lat,lng};
  });
  const reverse=Boolean(directions.hotelAtOrigin);
  const hotelPoint=points[reverse?0:1], landmarkPoint=points[reverse?1:0];
  const landmark=directions.landmark ?? directions.origin;
  return {hotel:{id:hotel.hotelId,name:hotel.name,address:hotel.address,latitude:hotelPoint.lat,longitude:hotelPoint.lng},
    initialOrigin:{...landmarkPoint,displayName:landmark?.displayName ?? landmark?.query ?? (reverse?"Điểm đến":"Điểm xuất phát")},hotelAtOrigin:reverse};
}
