import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
const root = path.resolve("frontend");
const comparisonProof=path.resolve("artifacts/chatbot/comparison-benefits-live-check.log");
const comparisonReply=existsSync(comparisonProof)?JSON.parse(readFileSync(comparisonProof,"utf8").replace(/^\uFEFF/,"")).livePublicCatalog?.comparisonBenefits?.qualityFollowup:null;
const routeProof=path.resolve("docs/assistant-bidirectional-directions-verification.json");
const routeCases=existsSync(routeProof)?JSON.parse(readFileSync(routeProof,"utf8").replace(/^\uFEFF/,"")).livePublicCatalog?.bidirectional?.cases ?? []:[];
const fixtures = `import { useState } from "react";
const comparisonReply=${JSON.stringify(comparisonReply)};
const routeCases=${JSON.stringify(routeCases)};
const hotelId = "7d86a6e0-67f1-4e5c-8e53-1b1a88730b50";
const rooms = [
 { id: "family", hotelId, hotelName: "Gia Định Park Hotel", name: "Phòng Gia Đình Deluxe", maxAdults: 2, maxChildren: 2, basePrice: 980000, areaSqm: 36, bedCount: 2, bedType: "Giường đôi", availabilityChecked: true, availableRooms: 3, amenities: ["WiFi", "Bữa sáng"], imageUrls: [] },
 { id: "queen", hotelId, hotelName: "Gia Định Park Hotel", name: "Phòng Tiêu Chuẩn Giường Queen", maxAdults: 2, maxChildren: 1, basePrice: 680000, areaSqm: 24, bedCount: 1, bedType: "Queen", availabilityChecked: true, availableRooms: 7, amenities: ["WiFi"], imageUrls: [] }
];
const hotels = [
 { hotelId, name: "Gia Định Park Hotel", address: "18 Phan Văn Trị, Gò Vấp, Hồ Chí Minh", coverImageUrl: "https://enziurooms.xyz/api/hotels/media/hotel-16e0fd4e-b619-4aac-bcb3-13b05e5ec227.jpg" },
 { hotelId: "d8ff807e-79ae-4576-8176-a78e114d7df0", name: "An Khang Riverside Hotel", address: "47 Nguyễn Thị Thập, Quận 7, Hồ Chí Minh", coverImageUrl: "https://enziurooms.xyz/api/hotels/media/hotel-0b831f8b-073b-4e8b-a355-4a1caaa09d58.jpg" },
 { hotelId: "4393e9ed-faa7-4f72-9394-5ed40157b4fe", name: "Greenway Phu Nhuan Hotel", address: "202 Hoàng Văn Thụ, Phú Nhuận, Hồ Chí Minh", coverImageUrl: "https://enziurooms.xyz/api/hotels/media/hotel-7fa6aedc-41f5-4dba-b330-8a7cb0a652fb.jpg" }
].map((h,i) => ({...h, copilotRank:i+1, matchPercent:100, starRating:3, roomTypeName:"Phòng Tiêu Chuẩn Giường Queen",maxAdults:2,maxChildren:1, pricePerNight:680000+i*40000,availabilityChecked:true,availableRooms:7,pricingChecked:true,discountChecked:true,totalStayAmount:680000+i*40000,finalPayableAmount:(680000+i*40000)*0.98,totalDiscount:(680000+i*40000)*0.02}));
const hotelMessages = [
 {role:"assistant",content:"Xin chào"},
 {role:"user",content:"Tôi muốn tìm khách sạn ở Sài Gòn"},
 {role:"assistant",content:"Có 3 khách sạn tại Hồ Chí Minh phù hợp với gia đình bạn. Xem tên, ảnh và giá từng khách sạn dưới đây.",hotels,context:{checkIn:"2026-10-29",checkOut:"2026-10-30",adults:2,children:1,availabilityChecked:true},intent:"RECOMMEND_HOTELS"}
];
export function useAiAssistant() {
 const [question, setQuestion] = useState("");
 const [tripOpen, setTripOpen] = useState(false);
 const [isOpen, setIsOpen] = useState(true);
 const [messages, setMessages] = useState(() => window.location.search.includes("route") && routeCases.length ? [hotelMessages[0],{role:"user",content:"Chỉ đường giữa T2 và khách sạn"},...routeCases.filter(c=>c.directions.hotelAtOrigin===window.location.search.includes("reverse")).slice(0,1).map(c=>({...c,role:"assistant",intent:"DIRECTIONS",content:c.answer}))] : window.location.search.includes("comparison") && comparisonReply ? [hotelMessages[0],{role:"user",content:"So sánh cả ba khách sạn về chất lượng"},{...comparisonReply,role:"assistant",content:comparisonReply.answer}] : window.location.search.includes("welcome") ? [{ role: "assistant", content: "Xin chào" }] : window.location.search.includes("hotels") ? hotelMessages : [
  { role: "assistant", content: "Xin chào" },
  { role: "user", content: "Bạn xem phòng nào hợp nhất với gia đình tôi?" },
  { role: "assistant", content: "Tôi gợi ý Phòng Gia Đình Deluxe: đủ chỗ cho 2 người lớn và 1 trẻ em, rộng 36 m² và có bữa sáng. Giá cơ bản 980.000 ₫/đêm. Các phòng dưới đây còn trống theo ngày bạn chọn.", rooms,
  model: "enziuroom-local-v3", engine: { id: "enziuroom-local-v3", mode: "LOCAL_SEMANTIC_AND_SYSTEM_DATA", externalModelUsed: false, semanticUnderstandingUsed: true }, suggestedPrompts: ["Loại nào tiết kiệm hơn?", "So sánh hai phòng này"] }
 ]);
 return { isOpen, tripOpen, setTripOpen, question, setQuestion, trip: { checkIn: "2026-10-29", checkOut: "2026-10-30", adults: 2, children: 1 }, updateTrip() {}, contextualHotel: (window.location.search.includes("comparison") || window.location.search.includes("hotels")) ? null : { id: hotelId, name: "Gia Định Park Hotel" }, messages, sending: false, error: "", latestSuggestions: window.location.search.includes("comparison") ? comparisonReply?.suggestedPrompts ?? [] : window.location.search.includes("hotels") ? ["Ưu tiên khách sạn có review tốt", "Tìm khách sạn có hồ bơi"] : ["Loại nào tiết kiệm hơn?", "So sánh hai phòng này"], latestUserQuestion: question, closeAssistant: () => setIsOpen(false), toggleAssistant: () => setIsOpen(v => !v), clearHotelContext() {}, resetConversation: () => setMessages([{role:"assistant",content:"Xin chào"}]), sendQuestion: async q => { setMessages(v => [...v,{role:"user",content:q},{role:"assistant",content:"Đây là bản xem trước bố cục. Câu trả lời của ứng dụng thật được lấy từ dữ liệu hệ thống."}]); setQuestion(""); } };
}`;
const server = await createServer({
 root, configFile: false, server: { host: "127.0.0.1", port: 5179, strictPort: true, proxy:{"/api/hotels/media":{target:"http://127.0.0.1",changeOrigin:true}} },
 plugins: [{ name: "assistant-fixture", enforce: "pre", resolveId(id) {
   if (id === "/preview-assistant.jsx") return "\0preview-entry";
   if (id.endsWith("ai/AiAssistantContext")) return "\0assistant-fixture";
   if (id.endsWith("auth/AuthContext")) return "\0auth-fixture";
 }, load(id) {
   if (id === "\0preview-entry") return 'import React from "react";import{createRoot}from"react-dom/client";import{BrowserRouter}from"react-router-dom";import "/src/index.css";import "/src/styles/index.css";import FloatingAiAssistant from "/src/components/ai/FloatingAiAssistant.jsx";createRoot(document.getElementById("root")).render(React.createElement(BrowserRouter,null,React.createElement(FloatingAiAssistant)));';
   if (id === "\0assistant-fixture") return fixtures;
   if (id === "\0auth-fixture") return 'export function useAuth() { return { user: { role: "CUSTOMER" }, isAuthenticated: true }; }';
 }, configureServer(server) { server.middlewares.use((req, res, next) => {
   if (!req.url.startsWith("/__assistant-preview")) return next();
   res.setHeader("Content-Type", "text/html; charset=utf-8");
   res.end(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Enziu chatbox preview</title><style>body{margin:0;background:#eff3f8;font-family:Segoe UI,Arial,sans-serif}main{max-width:1000px;margin:64px auto;padding:36px;background:white;border-radius:20px;color:#425b70}main small{letter-spacing:2px;color:#879aab}h1{font-weight:600}main p{color:#8193a2}</style></head><body><main><small>ENZIUROOMS</small><h1>Trợ lý chọn phòng</h1><p>Bản xem trước giao diện — dữ liệu minh họa.</p></main><div id="root"></div><script type="module" src="/preview-assistant.jsx"></script></body></html>`);
 }); } }], esbuild: { jsx: "automatic" }, optimizeDeps: { include: ["react", "react-dom/client", "react-router-dom"] }
});
await server.listen();
console.log("Assistant preview: http://localhost:5179/__assistant-preview");
