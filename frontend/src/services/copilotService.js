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

export async function analyzeCopilotRequirement(requirement) {
  return localAnalysis(requirement);
}

export async function explainCopilotResults(requirement, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";

  const first = candidates[0];
  const requirementText = String(requirement ?? "").trim();
  const second = candidates[1];
  const parts = [
    `${first.name} đứng đầu với mức phù hợp ${first.matchPercent}%${requirementText ? " dựa trên các tiêu chí bạn đã nhập" : ""}.`,
  ];

  if (first.budgetStatus === "WITHIN") {
    parts.push("Lựa chọn này nằm trong mức ngân sách đã đặt.");
  }
  if (second) {
    parts.push(`${second.name} là phương án thay thế tiếp theo nếu bạn muốn so sánh thêm.`);
  }
  return parts.join(" ");
}
