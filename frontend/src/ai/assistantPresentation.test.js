import test from "node:test";
import assert from "node:assert/strict";
import { guestSummary, hasLocalEngineMetadata, tripFromAssistant, recommendationLead, buildAssistantConversationContext, hotelResultsSummary, assistantSuggestions, assistantHotelFocus, directionsUrl, assistantMapRoute } from "./assistantPresentation.js";

test("focus is the single final visible hotel, never the first of a group", () => {
  const cards=[{hotelId:"park",name:"Park"},{hotelId:"crest",name:"Crest"},{hotelId:"green",name:"Green"}];
  assert.equal(assistantHotelFocus({intent:"RECOMMEND_HOTELS",hotels:cards}),null);
  assert.deepEqual(assistantHotelFocus({intent:"RECOMMEND_HOTELS",hotels:cards.slice(1,2)}),{id:"crest",name:"Crest"});
  assert.equal(assistantHotelFocus({intent:"RECOMMEND_HOTELS",hotels:[]}),null);
  assert.equal(assistantHotelFocus({intent:"COMPARE_HOTELS",hotels:cards.slice(0,2)}),null);
});

test("a new hotel search retires old room references, and an empty room result retains its known property", () => {
  const messages=[{role:"assistant",intent:"ROOM_RECOMMEND",rooms:[{id:"old-room",hotelId:"old-hotel"}],context:{adults:2}},
    {role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[{hotelId:"new-hotel"}],context:{adults:2,children:1}}];
  let state=buildAssistantConversationContext(messages);
  assert.equal(state.roomHotelId,null);
  assert.deepEqual(state.roomTypeIds,[]);
  assert.deepEqual(state.shownRoomIds,[]);
  messages.push({role:"assistant",intent:"ROOM_RECOMMEND",rooms:[],agentContext:{currentHotelId:"new-hotel"},context:{adults:2,children:1,maxBudgetPerNight:900000}});
  state=buildAssistantConversationContext(messages);
  assert.equal(state.roomHotelId,"new-hotel");
  assert.equal(state.lastRoomSearch.maxBudgetPerNight,900000);
});

test("a failed new search clears old references while a single narrowed result survives shortened history", () => {
  const trip={city:"Hồ Chí Minh",adults:2,children:1,checkIn:"2026-11-01",checkOut:"2026-11-03",maxBudgetPerNight:1500000};
  const messages=[{role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[{hotelId:"old"}],context:trip},
    {role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[],context:{...trip,city:"Vũng Tàu"}}];
  let state=buildAssistantConversationContext(messages);
  assert.deepEqual(state.hotelIds,[]);
  assert.deepEqual(state.recommendedHotelIds,[]);
  messages.push({role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[{hotelId:"a"},{hotelId:"b"},{hotelId:"c"}],context:trip},
    {role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[{hotelId:"crest"}],context:{...trip,city:"Quận 1"}},
    ...Array.from({length:12},()=>({role:"user",content:"Cảm ơn"})));
  state=buildAssistantConversationContext(messages);
  assert.deepEqual(state.hotelIds,["crest"]);
  assert.equal(state.lastHotelSearch.city,"Quận 1");
  assert.equal(state.lastHotelSearch.children,1);
  assert.equal(state.lastHotelSearch.checkOut,"2026-11-03");
  assert.equal(state.lastHotelSearch.maxBudgetPerNight,1500000);
});

test("trip and displayed guest counts retain the child in the reported family question", () => {
  const trip = tripFromAssistant({ adults: 2, children: 0, checkIn: "2026-10-28", checkOut: "2026-10-29" }, { adults: 2, children: 1 });
  assert.equal(guestSummary(trip.adults, trip.children), "2 người lớn và 1 trẻ em");
  assert.equal(trip.checkIn, "2026-10-28");
  assert.equal(tripFromAssistant(trip, { children: 0 }).children, 0);
});

test("a label or model name alone does not display the internal-engine indicator", () => {
  assert.equal(hasLocalEngineMetadata({ model: "enziuroom-local-v2" }), false);
  assert.equal(hasLocalEngineMetadata({ model: "enziuroom-local-v2", engine: { id: "enziuroom-local-v2", mode: "LOCAL_RULES_AND_SYSTEM_DATA", externalModelUsed: false } }), true);
  assert.equal(hasLocalEngineMetadata({ model: "enziuroom-local-v3", engine: { id: "enziuroom-local-v3", mode: "LOCAL_SEMANTIC_AND_SYSTEM_DATA", externalModelUsed: false, semanticUnderstandingUsed: true } }), true);
  assert.equal(hasLocalEngineMetadata({ model: "gemini", engine: { id: "gemini", mode: "LOCAL_RULES_AND_SYSTEM_DATA", externalModelUsed: false } }), false);
  assert.equal(hasLocalEngineMetadata({ model: "enziuroom-local-v2", engine: { id: "enziuroom-local-v2", mode: "LOCAL_RULES_AND_SYSTEM_DATA", externalModelUsed: true } }), false);
});

test("a family recommendation names the actual room and verified capacity", () => {
  const lead = recommendationLead({ name: "Lotus Hotel", roomTypeName: "Family", maxAdults: 2, maxChildren: 1 }, { adults: 2, children: 1 }, []);
  assert.match(lead, /Lotus Hotel — phòng Family/);
  assert.match(lead, /đủ chỗ cho 2 người lớn và 1 trẻ em/);
  assert.doesNotMatch(recommendationLead({ name: "A", maxAdults: 2, maxChildren: 0 }, { adults: 2, children: 1 }, []), /đủ chỗ/);
});

test("other hotels keeps all displayed IDs even when the original text is outside the eight-turn history", () => {
  const context = { city: "Hồ Chí Minh", adults: 2, children: 1, maxBudgetPerNight: 900000 };
  const messages = [
    { role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "NEW_SEARCH", context, hotels: [{ hotelId: "a" }, { hotelId: "b" }, { hotelId: "c" }] },
    ...Array.from({ length: 10 }, () => ({ role: "user", content: "Cảm ơn" })),
    { role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "MORE_HOTELS", context, hotels: [{ hotelId: "d" }, { hotelId: "e" }] },
  ];
  const state = buildAssistantConversationContext(messages);
  assert.deepEqual(state.shownHotelIds, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(state.lastHotelSearch, context);
});

test("a new search or changed trip starts a fresh result set, and exhaustion does not erase seen IDs", () => {
  const messages = [
    { role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "NEW_SEARCH", hotels: [{ hotelId: "old" }], context: { city: "Hà Nội" } },
    { role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "NEW_SEARCH", hotels: [{ hotelId: "new" }], context: { city: "Hồ Chí Minh" } },
    { role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "MORE_HOTELS", hotels: [], context: { city: "Hồ Chí Minh" } },
  ];
  assert.deepEqual(buildAssistantConversationContext(messages).shownHotelIds, ["new"]);
  messages.push({ role: "assistant", intent: "RECOMMEND_HOTELS", conversationAction: "RECHECK_TRIP", hotels: [{ hotelId: "fresh-date" }], context: { city: "Hồ Chí Minh" } });
  assert.deepEqual(buildAssistantConversationContext(messages).shownHotelIds, ["fresh-date"]);
});

test("room references retain display order and seen IDs through details, comparisons and a FAQ", () => {
  const context = { adults: 2, children: 1, roomCriteria: { refundableOnly: true, breakfastOnly: true, preference: "CHEAPEST" } };
  const messages = [
    { role: "assistant", intent: "ROOM_RECOMMEND", rooms: ["c", "a", "b"].map((id) => ({ id, hotelId: "hotel" })), context },
    { role: "assistant", intent: "ROOM_RECOMMEND", conversationAction: "SELECT_OPTION", rooms: [{ id: "a", hotelId: "hotel" }], context },
    { role: "assistant", intent: "GENERAL", answer: "Hướng dẫn thanh toán" },
    { role: "assistant", intent: "ROOM_RECOMMEND", conversationAction: "MORE_ROOMS", rooms: [{ id: "d", hotelId: "hotel" }], context },
    { role: "assistant", intent: "ROOM_RECOMMEND", conversationAction: "MORE_ROOMS", rooms: [], context },
  ];
  let state = buildAssistantConversationContext(messages);
  assert.deepEqual(state.shownRoomIds, ["c", "a", "b", "d"]);
  assert.deepEqual(state.roomTypeIds, ["d"]);
  assert.deepEqual(state.lastRoomSearch.roomCriteria, context.roomCriteria);
  messages.push({ role: "assistant", intent: "ROOM_RECOMMEND", rooms: [{ id: "new", hotelId: "other-hotel" }], context });
  state = buildAssistantConversationContext(messages);
  assert.deepEqual(state.shownRoomIds, ["new"]);
  assert.equal(state.roomHotelId, "other-hotel");
});

test("comparison subsets retain the original recommended roster for compare-all followups", () => {
  const messages=[
    {role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[{hotelId:"a"},{hotelId:"b"},{hotelId:"c"}],context:{adults:2,children:1}},
    {role:"assistant",intent:"COMPARE_HOTELS",hotels:[{hotelId:"a"},{hotelId:"c"}]},
  ];
  const state=buildAssistantConversationContext(messages);
  assert.deepEqual(state.hotelIds,["a","c"]);
  assert.deepEqual(state.recommendedHotelIds,["a","b","c"]);
  assert.equal(state.lastHotelSearch.adults,2);
});

const searchHotels = [
  { hotelId: "gia-dinh", name: "Gia Định Park Hotel" },
  { hotelId: "an-khang", name: "An Khang Riverside Hotel" },
  { hotelId: "greenway", name: "Greenway Phu Nhuan Hotel" },
];

test("route choices retain the nearby origin, trip and original hotel order across selections", () => {
  const nearby={query:"nhà ga T3",displayName:"T3 Tân Sơn Nhất",latitude:10.8122002,longitude:106.654338,radiusKm:5};
  const context={city:"Hồ Chí Minh",adults:2,children:1,checkIn:"2026-11-01",checkOut:"2026-11-03",nearby};
  const first={role:"assistant",intent:"RECOMMEND_HOTELS",context,hotels:searchHotels};
  const choices={role:"assistant",intent:"DIRECTIONS",directions:{origin:nearby,destinations:searchHotels.map(h=>({hotelId:h.hotelId,name:h.name})),hotelChoiceRequired:true,originRequired:false}};
  const selected={...choices,directions:{...choices.directions,hotelChoiceRequired:false,destinations:[{hotelId:searchHotels[1].hotelId}]}};
  const state=buildAssistantConversationContext([first,choices,selected]);
  assert.equal(state.lastIntent,"DIRECTIONS");
  assert.deepEqual(state.hotelIds,searchHotels.map(h=>h.hotelId));
  assert.deepEqual(state.lastHotelSearch,context);
  assert.equal(state.lastDirections.originQuery,"nhà ga T3");
  assert.deepEqual(state.lastDirections.destinationIds,[searchHotels[1].hotelId]);
  assert.equal(state.lastDirections.originResolved,true);
  assert.equal(assistantHotelFocus(choices),null);
  assert.deepEqual(assistantHotelFocus({...selected,directions:{...selected.directions,destinations:[searchHotels[1]]}}),{id:searchHotels[1].hotelId,name:searchHotels[1].name});
  assert.equal(buildAssistantConversationContext([first,choices,{role:"assistant",intent:"RECOMMEND_HOTELS",hotels:[],context:{city:"Huế"}}]).lastDirections,null);
});

test("OSM routes require two valid coordinates and old coordinate links migrate to OSM", () => {
  const url="https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=10.8122002%2C106.654338%3B10.7956%2C106.6588";
  assert.equal(directionsUrl(url),url);
  assert.equal(directionsUrl("https://www.google.com/maps/dir/?api=1&origin=10.8122002%2C106.654338&destination=10.7956%2C106.6588"),url);
  for(const value of [null,"javascript:alert(1)",url.replace("openstreetmap.org","openstreetmap.org.bad.invalid"),url.replace("10.8122002","91"),url.replace("%3B","%3B0%2C0%3B"),url.replace("10.7956%2C106.6588","0%2C0"),"https://www.google.com/maps/dir/?api=1&origin=10,106&destination=Hotel",url.replace("/directions","/user/content"),url.replace("www.openstreetmap.org","user@www.openstreetmap.org")]) assert.equal(directionsUrl(value),null);
});

test("reverse routes retain the landmark destination and the hotel role across turns", () => {
  const landmark={query:"nhà ga T2",displayName:"Nhà ga T2"};
  const result={role:"assistant",intent:"DIRECTIONS",directions:{landmark,origin:{query:"legacy"},destinations:[{hotelId:searchHotels[2].hotelId,name:searchHotels[2].name}],hotelAtOrigin:true,hotelChoiceRequired:false,originRequired:false}};
  const state=buildAssistantConversationContext([result]);
  assert.equal(state.lastDirections.originQuery,"nhà ga T2");
  assert.equal(state.lastDirections.hotelAtOrigin,true);
  assert.deepEqual(state.lastDirections.destinationIds,[searchHotels[2].hotelId]);
  assert.deepEqual(assistantHotelFocus(result),{id:searchHotels[2].hotelId,name:searchHotels[2].name});
});

test("coordinate lookup keeps its goal when the next turn supplies only a hotel name",()=>{
  const state=buildAssistantConversationContext([{role:"assistant",intent:"DIRECTIONS",directions:{coordinatesOnly:true,landmark:{query:"nhà ga T1"},destinations:[{hotelId:"park",name:"Gia Định Park Hotel"}],originRequired:false,hotelChoiceRequired:false}}]);
  assert.equal(state.lastDirections.coordinatesOnly,true);
  assert.equal(state.lastDirections.originQuery,"nhà ga T1");
  assert.deepEqual(state.lastDirections.destinationIds,["park"]);
});

test("the embedded map receives both ordered coordinates without guessing or geocoding names", () => {
  const origin="10.8167568,106.6638006", hotel="10.82701,106.68663";
  for(const reverse of [false,true]) {
    const route=assistantMapRoute({hotelAtOrigin:reverse,landmark:{displayName:"Nhà ga T2"}}, {hotelId:"hotel",name:"Gia Định Park Hotel",address:"18 Phan Văn Trị",mapsUrl:`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(reverse?hotel+";"+origin:origin+";"+hotel)}`});
    assert.deepEqual(route.hotel,{id:"hotel",name:"Gia Định Park Hotel",address:"18 Phan Văn Trị",latitude:10.82701,longitude:106.68663});
    assert.deepEqual(route.initialOrigin,{lat:10.8167568,lng:106.6638006,displayName:"Nhà ga T2"});
    assert.equal(route.hotelAtOrigin,reverse);
  }
  assert.equal(assistantMapRoute({}, {hotelId:"hotel",name:"hotel",mapsUrl:"javascript:alert(1)"}),null);
});

test("the search summary introduces every displayed hotel and uses the filtered result count", () => {
  for (const count of [2, 3]) {
    const visible = searchHotels.slice(0, count);
    const summary = hotelResultsSummary(visible, { destination: "Hồ Chí Minh", adults: 2, children: 1 });
    assert.ok(summary.includes(`${count} khách sạn`));
    for (const hotel of visible) assert.ok(summary.includes(hotel.name));
    assert.match(summary, /2 người lớn và 1 trẻ em/);
    if (count === 2) assert.ok(!summary.includes(searchHotels[2].name));
  }
  assert.match(hotelResultsSummary(searchHotels, { adults: 2 }, true), /3 khách sạn khác/);
});

test("a filtered single-hotel result cannot retain a stale two-hotel comparison suggestion", () => {
  const message = { intent: "RECOMMEND_HOTELS", hotels: searchHotels.slice(0, 1), suggestedPrompts: ["So sánh hai khách sạn", "Xem khách sạn khác"] };
  assert.deepEqual(assistantSuggestions(message), ["Xem khách sạn khác"]);
  assert.deepEqual(assistantSuggestions({ ...message, suggestedPrompts: [] }, ["So sánh các lựa chọn vừa nói", "Đổi ngân sách"]), ["Đổi ngân sách"]);
  assert.deepEqual(assistantSuggestions({ intent: "ROOM_RECOMMEND", suggestedPrompts: ["So sánh hai phòng này"] }), ["So sánh hai phòng này"]);
});

test("nearby results name their landmark and radius instead of treating it as a district", () => {
  const nearby = { query:"T3", displayName:"Nhà ga T3 sân bay Tân Sơn Nhất", radiusKm:5, latitude:10.8122002, longitude:106.654338 };
  const summary = hotelResultsSummary(searchHotels, { adults:2, children:1, destination:"Hồ Chí Minh", nearby });
  assert.match(summary, /bán kính 5 km quanh Nhà ga T3/);
  assert.match(summary, /đường chim bay/);
  assert.match(summary, /xếp gần trước/);
  const state = buildAssistantConversationContext([{intent:"RECOMMEND_HOTELS", role:"assistant",hotels:searchHotels,context:{nearby,adults:2,children:1}}]);
  assert.deepEqual(state.lastHotelSearch.nearby,nearby);
});
