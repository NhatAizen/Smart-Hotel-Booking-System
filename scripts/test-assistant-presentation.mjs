// Render the real chat component with isolated fixtures; no application authentication changes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
const root = fileURLToPath(new URL("../frontend/", import.meta.url));
const require = createRequire(root + "/package.json");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter } = require("react-router-dom");
const server = await createServer({
  root, configFile: false, server: { middlewareMode: true }, appType: "custom",
  esbuild: { jsx: "automatic" },
  plugins: [{
    name: "assistant-render-fixtures", enforce: "pre",
    resolveId(id) {
      if (id.endsWith("ai/AiAssistantContext")) return "\0assistant-test-context";
      if (id.endsWith("auth/AuthContext")) return "\0assistant-test-auth";
    },
    load(id) {
      if (id === "\0assistant-test-context") return "export function useAiAssistant(){return globalThis.__assistantRenderFixture}";
      if (id === "\0assistant-test-auth") return 'export function useAuth(){return {user:{role:"CUSTOMER"},isAuthenticated:true}}';
    },
  }],
});
try {
  const { default: Chat } = await server.ssrLoadModule("/src/components/ai/FloatingAiAssistant.jsx");
  const { hotelResultsSummary } = await import("../frontend/src/ai/assistantPresentation.js");
  const hotels = [
    { hotelId: "a", name: "Gia Định Park Hotel" },
    { hotelId: "b", name: "An Khang Riverside Hotel" },
    { hotelId: "c", name: "Greenway Phu Nhuan Hotel" },
  ].map((hotel, index) => ({ ...hotel, coverImageUrl:index<2?`http://localhost:8080/api/hotels/media/hotel-${hotel.hotelId}.jpg`:null, copilotRank:index+1, pricePerNight:680000+index*40000, maxAdults:2,maxChildren:1, availableRooms:7,availabilityChecked:true }));
  const trip = { checkIn:"2026-10-29",checkOut:"2026-10-30",adults:2,children:1 };
  for (const count of [0, 1, 2, 3]) {
    const visible=hotels.slice(0,count);
    globalThis.__assistantRenderFixture = {
      isOpen:true, tripOpen:false, setTripOpen(){}, question:"",setQuestion(){},trip,updateTrip(){},
      contextualHotel:null,sending:false,error:"",latestSuggestions:[],
      messages:[{role:"assistant",content:"Xin chào"},{role:"user",content:"Tìm khách sạn ở Sài Gòn"},
        {role:"assistant",intent:"RECOMMEND_HOTELS",content:count>1?hotelResultsSummary(visible,{...trip,destination:"Hồ Chí Minh"}):count?"Có một khách sạn phù hợp":"Chưa có kết quả",hotels:visible,context:{...trip,availabilityChecked:true}}],
      closeAssistant(){},toggleAssistant(){},clearHotelContext(){},resetConversation(){},sendQuestion(){},
    };
    const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Chat)));
    assert.equal(html.includes("So sánh 2 khách sạn đầu tiên"),false, `Removed comparison control still shown for ${count} hotels`);
    assert.ok(!html.includes('src="http://localhost:8080/'), 'Stored development image URLs must be resolved through the current origin');
    if(count>=2) assert.ok(html.includes(`Tôi tìm được ${count} khách sạn`));
    const cards = [...html.matchAll(/<article class="enziu-fai-hotel-card"[\s\S]*?<\/article>/g)].map(match=>match[0]);
    assert.equal(cards.length,count);
    for (const [index, card] of cards.entries()) {
      const hotel=visible[index];
      assert.ok(card.includes(`aria-label="Khách sạn: ${hotel.name}"`));
      assert.ok(card.includes(`<h3><a href="/hotels/${hotel.hotelId}?`));
      assert.ok(card.includes(`>${hotel.name}</a></h3>`), 'Hotel must be named on its own card, even without an image');
      if(hotel.coverImageUrl) {
        assert.ok(card.includes(`alt="Ảnh ${hotel.name}"`));
        assert.ok(card.includes(`src="/api/hotels/media/hotel-${hotel.hotelId}.jpg"`));
      }
    }
    console.log(`PASS: real chat markup with ${count} hotel(s)`);
  }
  for(const count of [2,3]) {
    globalThis.__assistantRenderFixture.messages=[{role:"assistant",intent:"COMPARE_HOTELS",content:"So sánh chất lượng",hotels:hotels.slice(0,count),context:trip,
      comparison:{focus:"QUALITY",rows:[{label:"Tiện nghi",values:Array(count).fill("WiFi")},{label:"Đánh giá khách",values:Array(count).fill("Chưa có đánh giá")}],note:"Chưa đủ đánh giá để xếp hạng dịch vụ."}}];
    globalThis.__assistantRenderFixture.messages.unshift({role:"assistant",content:"Xin chào"},{role:"user",content:"So sánh chất lượng"});
    const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Chat)));
    assert.ok(html.includes(`<caption>So sánh ${count} khách sạn về chất lượng</caption>`));
    for(const hotel of hotels.slice(0,count)) assert.ok(html.includes(`>${hotel.name}</a></th>`));
    assert.equal((html.match(/scope="col"/g)||[]).length,count+1);
    assert.equal((html.match(/<td>/g)||[]).length,count*3);
    assert.ok(!html.includes('class="enziu-fai-hotel-card"'));
    assert.ok(html.includes("Chưa đủ đánh giá"));
    console.log(`PASS: ${count}-hotel quality comparison table`);
  }
  globalThis.__assistantRenderFixture.messages=[{role:"assistant",content:"Xin chào"},{role:"user",content:"Gần T3"},
    {role:"assistant",content:"Khoảng cách đường chim bay",intent:"RECOMMEND_HOTELS",hotels:hotels.slice(0,1),context:{...trip,nearby:{displayName:"Nhà ga T3",sourceUrl:"https://www.openstreetmap.org/way/1240951104"}}}];
  const nearbyHtml=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Chat)));
  assert.ok(nearbyHtml.includes('href="https://www.openstreetmap.org/way/1240951104"'));
  assert.ok(nearbyHtml.includes("OpenStreetMap contributors"));
  console.log("PASS: map-source attribution in real chat markup");
  for(const {count,reverse} of [{count:1,reverse:false},{count:3,reverse:false},{count:1,reverse:true},{count:3,reverse:true}]) {
    const maps=reverse ? "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=10.7956%2C106.6588%3B10.8122002%2C106.654338" : count===1 ? "https://www.google.com/maps/dir/?api=1&origin=10.8122002%2C106.654338&destination=10.7956%2C106.6588"
      : "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=10.8122002%2C106.654338%3B10.7956%2C106.6588";
    globalThis.__assistantRenderFixture.messages=[{role:"assistant",content:"Xin chào"},{role:"user",content:"Chỉ đường từ T3 đến khách sạn đó"},
      {role:"assistant",intent:"DIRECTIONS",content:count>1?"Bạn muốn chọn khách sạn nào?":"Đường đi",directions:{hotelAtOrigin:reverse,origin:{query:"T3",displayName:"Nhà ga T3",sourceUrl:"https://www.openstreetmap.org/way/1240951104"},destinations:hotels.slice(0,count).map(h=>({hotelId:h.hotelId,name:h.name,address:"18 Hoàng Việt, Tân Bình, Hồ Chí Minh",mapsUrl:maps}))}}];
    const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Chat)));
    assert.equal((html.match(/class="enziu-fai-route-card"/g)||[]).length,count);
    assert.equal((html.match(/Xem đường đi trên bản đồ/g)||[]).length,count);
    assert.ok(!html.includes('href="https://www.openstreetmap.org/directions'));
    assert.ok(!html.includes('href="https://www.google.com/'));
    assert.ok(html.includes(reverse?"Điểm đến: ":"Xuất phát: "));
    if(reverse) assert.equal((html.match(/<small>Xuất phát<\/small>/g)||[]).length,count);
    assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
    for(const hotel of hotels.slice(0,count)) assert.ok(html.includes(`<strong>${hotel.name}</strong>`));
    assert.ok(html.includes("18 Hoàng Việt"));
    assert.ok(!html.includes('class="enziu-fai-hotel-card"'));
    console.log(`PASS: directions from T3 with ${count} destination(s)`);
  }
  const message=globalThis.__assistantRenderFixture.messages.at(-1);
  message.directions.coordinatesOnly=true;
  const coordinatesHtml=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Chat)));
  assert.ok(coordinatesHtml.includes("Địa điểm: "));
  assert.ok(!coordinatesHtml.includes("Xem đường đi trên bản đồ"));
  console.log("PASS: coordinate lookup does not offer an unrelated route action");
} finally {
  delete globalThis.__assistantRenderFixture;
  await server.close();
}
