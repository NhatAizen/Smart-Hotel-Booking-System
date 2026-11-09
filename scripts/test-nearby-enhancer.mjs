import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
const server = await createServer({root:fileURLToPath(new URL("../frontend/",import.meta.url)),configFile:false,server:{middlewareMode:true},appType:"custom",
  plugins:[{name:"public-catalog-fixture",enforce:"pre",resolveId(id){if(id.endsWith("services/hotelService"))return "\0hotel-fixture";},
    load(id){if(id==="\0hotel-fixture")return "export async function getHotelById(){return {city:'Hồ Chí Minh',district:'Tân Bình'}}; export async function getRoomTypesByHotel(){throw Error('No dated request expected')}; export async function getRoomsByHotel(){throw Error('No dated request expected')}";}}]});
try {
  const {enhanceAssistantResponse}=await server.ssrLoadModule("/src/ai/bookingCopilotEnhancer.js");
  const nearby={query:"nhà ga T3",displayName:"Nhà ga T3 sân bay Tân Sơn Nhất",radiusKm:5,latitude:10.8122002,longitude:106.654338,sourceUrl:"https://www.openstreetmap.org/way/1240951104"};
  const hotels=[{hotelId:"cheap",name:"Xa hơn rẻ hơn",distanceKm:3,pricePerNight:100000},{hotelId:"near",name:"Gần hơn",distanceKm:.5,pricePerNight:900000},{hotelId:"outside",name:"Ngoài bán kính",distanceKm:6},{hotelId:"unknown",name:"Chưa có tọa độ"}];
  const response={intent:"RECOMMEND_HOTELS",hotels,context:{city:"Quận 1",adults:2,children:1,nearby}};
  const result=await enhanceAssistantResponse({question:"Bán kính 5 km",response,trip:{adults:2,children:1}});
  assert.deepEqual(result.hotels.map(h=>h.hotelId),["near","cheap"],"Distance governs ordering; old district cannot filter out nearby properties");
  assert.match(result.answer,/bán kính 5 km quanh Nhà ga T3/);
  assert.match(result.answer,/đường chim bay/);
  assert.match(result.hotels[0].copilotReasons[0],/0,5 km/);
  const unavailable={...response,answer:"Chưa xác định được địa điểm. Bạn cho biết địa chỉ nhé.",hotels:[]};
  assert.deepEqual(await enhanceAssistantResponse({question:"Gần địa điểm chưa rõ",response:unavailable,trip:{}}),unavailable);
  console.log("PASS: nearby distance ordering, radius, missing coordinates, stale district, map evidence and unavailable-place answer");
} finally {await server.close();}
