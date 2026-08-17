import apiClient from "../api/apiClient";

const AMENITY_PATTERNS = [
  { value: "hồ bơi", patterns: ["ho boi", "be boi", "pool"] },
  { value: "wifi", patterns: ["wifi", "wi-fi"] },
  { value: "bữa sáng", patterns: ["bua sang", "breakfast"] },
  { value: "bãi đỗ xe", patterns: ["bai do xe", "bai dau xe", "dau xe", "parking"] },
  { value: "gym", patterns: ["gym", "phong tap"] },
  { value: "spa", patterns: ["spa"] },
  { value: "điều hòa", patterns: ["dieu hoa", "may lanh", "air conditioning"] },
];

function stripVietnamese(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalize(value) {
  return stripVietnamese(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBudgetLocally(requirement) {
  const raw = String(requirement ?? "").toLowerCase();

  const million = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr|million|m)\b/i);
  if (million) {
    const numeric = Number(million[1].replace(",", "."));
    if (Number.isFinite(numeric)) return Math.round(numeric * 1_000_000);
  }

  const thousand = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:nghìn|nghin|ngàn|ngan|k)\b/i);
  if (thousand) {
    const numeric = Number(thousand[1].replace(",", "."));
    if (Number.isFinite(numeric)) return Math.round(numeric * 1_000);
  }

  const full = raw.match(/(\d{1,3}(?:[.\s]\d{3}){1,3})\s*(?:đ|vnd|đồng|dong)?/i);
  if (full) {
    const numeric = Number(full[1].replace(/[.\s]/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

function extractDestinationLocally(requirement) {
  const raw = String(requirement ?? "").trim();
  const match = raw.match(
    /(?:ở|tại|gần)\s+([^,.!?\n]+?)(?=\s+(?:cho|với|dưới|trên|ngân\s*sách|giá|giá|tối\s*đa|khoảng|có|ưu\s*tiên|review|đánh\s*giá)\b|[,.\n]|$)/i,
  );
  if (!match?.[1]) return null;
  const value = match[1].trim();
  return value.length <= 80 ? value : null;
}

function localAnalysis(requirement) {
  const normalized = normalize(requirement);
  const amenities = AMENITY_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => normalized.includes(pattern)))
    .map((entry) => entry.value);

  const minStarsMatch = normalized.match(/([1-5])\s*(?:sao|star)/);
  const perNight =
    /moi dem|mot dem|\/\s*dem|per night|gia dem|gia moi dem/.test(normalized);

  return {
    destination: extractDestinationLocally(requirement),
    budget: extractBudgetLocally(requirement),
    budgetMode: perNight ? "PER_NIGHT" : "TOTAL",
    amenities,
    preferGoodReviews:
      /review|danh gia|uy tin|tot|chat luong|duoc khen/.test(normalized),
    minStars: minStarsMatch ? Number(minStarsMatch[1]) : null,
    analysisSource: "LOCAL",
  };
}

function sanitizeAiAnalysis(payload, fallback) {
  const destination =
    typeof payload?.destination === "string" && payload.destination.trim()
      ? payload.destination.trim().slice(0, 80)
      : fallback.destination;

  const budget = safeNumber(payload?.budget);
  const safeBudget =
    budget != null && budget > 0 && budget <= 1_000_000_000
      ? Math.round(budget)
      : fallback.budget;

  const mode = String(payload?.budgetMode ?? "").toUpperCase();
  const budgetMode = ["TOTAL", "PER_NIGHT"].includes(mode)
    ? mode
    : fallback.budgetMode;

  const aiAmenities = Array.isArray(payload?.amenities)
    ? payload.amenities
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const minStars = safeNumber(payload?.minStars);

  return {
    destination,
    budget: safeBudget,
    budgetMode,
    amenities: [...new Set([...fallback.amenities, ...aiAmenities])],
    preferGoodReviews:
      typeof payload?.preferGoodReviews === "boolean"
        ? payload.preferGoodReviews
        : fallback.preferGoodReviews,
    minStars:
      minStars != null && minStars >= 1 && minStars <= 5
        ? Math.round(minStars)
        : fallback.minStars,
    analysisSource: "GEMINI",
  };
}

function extractJson(text) {
  const value = String(text ?? "").trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function analyzeCopilotRequirement(requirement) {
  const fallback = localAnalysis(requirement);

  if (!String(requirement ?? "").trim()) {
    return fallback;
  }

  const prompt = `
Bạn là bộ phân tích yêu cầu cho EnziuRooms Booking Copilot.
Chỉ trích xuất điều người dùng THỰC SỰ nói. Không tự thêm dữ liệu.
Trả về DUY NHẤT JSON hợp lệ, không markdown, theo schema:
{
  "destination": string|null,
  "budget": number|null,
  "budgetMode": "TOTAL"|"PER_NIGHT"|null,
  "amenities": string[],
  "preferGoodReviews": boolean,
  "minStars": number|null
}

Quy tắc:
- budget luôn là số VND. "2 triệu" => 2000000.
- "mỗi đêm", "/đêm" => PER_NIGHT.
- Nếu người dùng nói "tôi có/ngân sách X" mà không nói mỗi đêm => TOTAL.
- Không suy đoán ngày, số phòng hay số khách.
- amenities dùng tên ngắn tiếng Việt.
- destination giữ nguyên địa danh người dùng nêu.

Yêu cầu:
${requirement}
`.trim();

  try {
    const response = await apiClient.post("/ai/chat", { message: prompt });
    const parsed = extractJson(response?.data?.result);
    if (!parsed) return fallback;
    return sanitizeAiAnalysis(parsed, fallback);
  } catch {
    return fallback;
  }
}

function compactCandidateFacts(candidate) {
  return {
    rank: candidate.rank,
    name: candidate.name,
    matchPercent: candidate.matchPercent,
    location: candidate.location,
    roomTypeName: candidate.roomTypeName,
    totalAmount: candidate.totalAmount,
    nightlyAmount: candidate.nightlyAmount,
    pricingChecked: candidate.pricingChecked,
    availabilityChecked: candidate.availabilityChecked,
    availableRoomCount: candidate.availabilityChecked
      ? candidate.availableRoomCount
      : null,
    averageRating: candidate.averageRating,
    reviewCount: candidate.reviewCount,
    matchedAmenities: candidate.matchedAmenities,
    requestedAmenities: candidate.requestedAmenities,
    budgetStatus: candidate.budgetStatus,
    reasons: candidate.reasons,
  };
}

export async function explainCopilotResults(
  requirement,
  candidates,
  { datesSelected = false } = {},
) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";

  const facts = candidates.map(compactCandidateFacts);
  const prompt = `
Bạn là EnziuRooms Booking Copilot.
Viết tối đa 3 câu tiếng Việt để giải thích kết quả Top ${facts.length}.
CHỈ được dùng dữ liệu FACTS bên dưới.
Tuyệt đối không bịa giá, số phòng, khoảng cách, khuyến mãi hoặc đánh giá.
${datesSelected
  ? "Đã có ngày lưu trú; chỉ được nói còn phòng khi FACTS availabilityChecked=true."
  : 'Chưa kiểm tra ngày lưu trú; nếu nhắc availability phải nói "chưa kiểm tra phòng trống".'}
Không nói rằng bạn đã đặt phòng hay thực hiện thanh toán.
Nêu lựa chọn #1 và trade-off đáng chú ý nếu có.

Yêu cầu người dùng:
${String(requirement ?? "").slice(0, 1200)}

FACTS:
${JSON.stringify(facts)}
`.trim();

  try {
    const response = await apiClient.post("/ai/chat", { message: prompt });
    const result = String(response?.data?.result ?? "").trim();
    if (result) return result.slice(0, 900);
  } catch {
    // Deterministic fallback below.
  }

  const first = candidates[0];
  const second = candidates[1];
  const parts = [
    `${first.name} đứng đầu với mức phù hợp ${first.matchPercent}% dựa trên các tiêu chí bạn đã nhập.`,
  ];

  if (first.budgetStatus === "WITHIN") {
    parts.push("Lựa chọn này nằm trong mức ngân sách đã đặt.");
  }
  if (second) {
    parts.push(`${second.name} là phương án thay thế tiếp theo nếu bạn muốn so sánh thêm.`);
  }
  return parts.join(" ");
}
