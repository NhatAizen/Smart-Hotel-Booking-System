import {
  getBookingPricingQuote,
  getHotelAvailability,
} from "../services/bookingService";
import {
  getHotelById,
  getRoomTypesByHotel,
  getRoomsByHotel,
} from "../services/hotelService";
import {
  getPromotionRecommendations,
  previewDiscount,
} from "../services/promotionService";

const AMENITY_PATTERNS = [
  { label: "Hồ bơi", patterns: ["ho boi", "be boi", "pool"] },
  { label: "WiFi", patterns: ["wifi", "wi-fi"] },
  { label: "Bữa sáng", patterns: ["bua sang", "breakfast"] },
  { label: "Bãi đỗ xe", patterns: ["bai do xe", "bai dau xe", "parking"] },
  { label: "Gym", patterns: ["gym", "phong tap"] },
  { label: "Spa", patterns: ["spa"] },
  { label: "Điều hòa", patterns: ["dieu hoa", "may lanh", "air conditioning"] },
];

function stripVietnamese(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalize(value) {
  return stripVietnamese(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLocation(value) {
  return normalize(value)
    .replace(/\b(?:tp|thanh pho)\s*(?:hcm|ho chi minh)\b/g, "ho chi minh")
    .replace(/\b(?:hcm|sai gon)\b/g, "ho chi minh")
    .replace(/\bq\s*(\d{1,2})\b/g, "quan $1")
    .replace(/\bquan\s*0?(\d{1,2})\b/g, "quan $1")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function formatMoney(value) {
  const numeric = numberOrNull(value);
  if (numeric == null) return "—";
  return `${Math.round(numeric).toLocaleString("vi-VN")} ₫`;
}


function promotionScope(suggestion) {
  return String(suggestion?.promotion?.scope ?? "").trim().toUpperCase();
}

function estimatedPromotionDiscount(suggestion) {
  return Math.max(0, Number(suggestion?.estimatedDiscount ?? 0) || 0);
}

function bestSuggestionForScope(suggestions, scope) {
  return suggestions
    .filter((item) => promotionScope(item) === scope)
    .filter((item) => item?.promotion?.code)
    .sort(
      (left, right) =>
        estimatedPromotionDiscount(right) - estimatedPromotionDiscount(left),
    )[0] ?? null;
}

async function safeDiscountPreview(payload) {
  try {
    return await previewDiscount(payload);
  } catch {
    return null;
  }
}

function discountCandidateKey(candidate) {
  return `${candidate.hotelPromotionCode ?? ""}|${candidate.platformPromotionCode ?? ""}`;
}

async function resolveBestDiscount(hotelId, grossAmount) {
  const safeGross = numberOrNull(grossAmount);
  if (!hotelId || safeGross == null || safeGross <= 0) {
    return { discountChecked: false };
  }

  let suggestions = [];
  try {
    const response = await getPromotionRecommendations(hotelId, safeGross);
    suggestions = Array.isArray(response) ? response : [];
  } catch {
    suggestions = [];
  }

  const bestHotel = bestSuggestionForScope(suggestions, "HOTEL");
  const bestPlatform = bestSuggestionForScope(suggestions, "PLATFORM");

  const candidates = [
    { hotelPromotionCode: null, platformPromotionCode: null },
    ...(bestHotel?.promotion?.code
      ? [{ hotelPromotionCode: bestHotel.promotion.code, platformPromotionCode: null }]
      : []),
    ...(bestPlatform?.promotion?.code
      ? [{ hotelPromotionCode: null, platformPromotionCode: bestPlatform.promotion.code }]
      : []),
    ...(bestHotel?.promotion?.code && bestPlatform?.promotion?.code
      ? [{
          hotelPromotionCode: bestHotel.promotion.code,
          platformPromotionCode: bestPlatform.promotion.code,
        }]
      : []),
  ];

  const uniqueCandidates = [...new Map(
    candidates.map((item) => [discountCandidateKey(item), item]),
  ).values()];

  const evaluated = (
    await Promise.all(
      uniqueCandidates.map(async (candidate) => {
        const preview = await safeDiscountPreview({
          hotelId,
          amount: safeGross,
          hotelPromotionCode: candidate.hotelPromotionCode,
          platformPromotionCode: candidate.platformPromotionCode,
        });
        if (!preview) return null;

        const finalAmount = numberOrNull(preview.finalAmount);
        if (finalAmount == null || finalAmount < 0) return null;

        return {
          preview,
          finalAmount,
          hotelPromotionCode:
            preview.hotelPromotionCode ?? candidate.hotelPromotionCode ?? null,
          platformPromotionCode:
            preview.platformPromotionCode ?? candidate.platformPromotionCode ?? null,
        };
      }),
    )
  ).filter(Boolean);

  if (!evaluated.length) {
    return {
      discountChecked: false,
      promotionSuggestionsChecked: true,
      promotionSuggestionCount: suggestions.length,
    };
  }

  evaluated.sort((left, right) => left.finalAmount - right.finalAmount);
  const best = evaluated[0];
  const preview = best.preview;
  const totalDiscount = Math.max(
    0,
    numberOrNull(preview.totalDiscount) ?? safeGross - best.finalAmount,
  );

  return {
    discountChecked: true,
    grossAmount: safeGross,
    finalPayableAmount: best.finalAmount,
    totalDiscount,
    membershipName: preview.membershipName ?? null,
    membershipPercent: numberOrNull(preview.membershipPercent) ?? 0,
    membershipDiscount: numberOrNull(preview.membershipDiscount) ?? 0,
    hotelPromotionCode: best.hotelPromotionCode,
    hotelPromotionDiscount: numberOrNull(preview.hotelPromotionDiscount) ?? 0,
    platformPromotionCode: best.platformPromotionCode,
    platformPromotionDiscount: numberOrNull(preview.platformPromotionDiscount) ?? 0,
    promotionSuggestionsChecked: true,
    promotionSuggestionCount: suggestions.length,
    hasRecommendedPromotion: Boolean(
      best.hotelPromotionCode || best.platformPromotionCode,
    ),
  };
}

function effectivePayableAmount(hotel) {
  if (hotel?.discountChecked) {
    const finalAmount = numberOrNull(hotel.finalPayableAmount);
    if (finalAmount != null) return finalAmount;
  }
  return null;
}

function extractBudget(question) {
  const raw = String(question ?? "").toLowerCase();

  const million = raw.match(
    /(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr|million|m)\b/i,
  );
  if (million) {
    const numeric = Number(million[1].replace(",", "."));
    if (Number.isFinite(numeric)) return Math.round(numeric * 1_000_000);
  }

  const thousand = raw.match(
    /(\d+(?:[.,]\d+)?)\s*(?:nghìn|nghin|ngàn|ngan|k)\b/i,
  );
  if (thousand) {
    const numeric = Number(thousand[1].replace(",", "."));
    if (Number.isFinite(numeric)) return Math.round(numeric * 1_000);
  }

  const full = raw.match(
    /(\d{1,3}(?:[.\s]\d{3}){1,3})\s*(?:đ|vnd|đồng|dong)?/i,
  );
  if (full) {
    const numeric = Number(full[1].replace(/[.\s]/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

function extractDestination(question) {
  const raw = String(question ?? "").trim();

  // Ưu tiên nhận các địa danh có cấu trúc rõ. Không dùng \b quanh từ tiếng Việt
  // vì JavaScript word-boundary chỉ đáng tin với nhóm ký tự ASCII.
  const structuredExplicit = raw.match(
    /(?:^|[\s,;])(ở|tại|gần)\s+((?:quận|q)\s*0?\d{1,2}|thủ\s*đức|(?:tp\.?\s*)?(?:hồ\s*chí\s*minh|hcm)|sài\s*gòn)/i,
  );

  if (structuredExplicit?.[2]) {
    const canonical = canonicalLocation(structuredExplicit[2]);
    const district = canonical.match(/^quan\s+(\d{1,2})$/);
    return {
      value: district ? `Quận ${district[1]}` : structuredExplicit[2].trim(),
      hard: /^(ở|tại)$/i.test(structuredExplicit[1]),
      mode: structuredExplicit[1].toLowerCase(),
    };
  }

  // Fallback cho địa danh tự do: "ở Đà Lạt có hồ bơi", "tại Nha Trang, ...".
  // Stop-word được kết thúc bằng khoảng trắng/dấu câu thay vì \b Unicode.
  const explicitPattern =
    /(?:^|[\s,;])(ở|tại|gần)\s+([^,.!?\n]+?)(?=\s+(?:và\s+)?(?:cho|với|dưới|trên|ngân\s*sách|giá|tối\s*đa|khoảng|có|ưu\s*tiên|review|đánh\s*giá)(?:\s|[,;!.?]|$)|[,;!.?\n]|$)/i;

  const match = raw.match(explicitPattern);
  if (match?.[2]) {
    return {
      value: match[2].trim().replace(/\s+và$/i, "").slice(0, 80),
      hard: /^(ở|tại)$/i.test(match[1]),
      mode: match[1].toLowerCase(),
    };
  }

  // Hỗ trợ cách nói không có giới từ: "tìm khách sạn Quận 1 có hồ bơi".
  const normalized = normalize(raw);
  const structured = normalized.match(
    /(?:khach\s*san\s+)?((?:quan|q)\s*\d{1,2}|thu\s*duc|ho\s*chi\s*minh|hcm|sai\s*gon)(?=\s+(?:va\s+)?(?:co|gia|duoi|tren|review|danh\s*gia|uu\s*tien|cho|voi)(?:\s|$)|$)/i,
  );

  if (structured?.[1]) {
    const canonical = canonicalLocation(structured[1]);
    const district = canonical.match(/^quan\s+(\d{1,2})$/);
    return {
      value: district ? `Quận ${district[1]}` : structured[1].trim(),
      hard: true,
      mode: "structured",
    };
  }

  return { value: "", hard: false, mode: null };
}

function extractCriteria(question, trip) {
  const normalized = normalize(question);
  const destination = extractDestination(question);
  const budget = extractBudget(question);
  const amenities = AMENITY_PATTERNS
    .filter((entry) =>
      entry.patterns.some((pattern) => normalized.includes(pattern)),
    )
    .map((entry) => entry.label);
  const rawQuestion = String(question ?? "");
  const perNight =
    /moi dem|mot dem|per night|gia dem/.test(normalized) ||
    /\/\s*(?:đêm|dem)|mỗi\s*đêm|moi\s*dem/i.test(rawQuestion);
  const budgetSoft = /khoang|tam|xap xi/.test(normalized);
  const budgetStrict = Boolean(budget) && !budgetSoft;
  const goodReviews = /review|danh gia|uy tin|tot|chat luong|duoc khen/.test(
    normalized,
  );
  const minStarsMatch = normalized.match(/([1-5])\s*(?:sao|star)/);
  const datesSelected = Boolean(
    trip?.checkIn && trip?.checkOut && trip.checkOut > trip.checkIn,
  );

  return {
    budget,
    budgetMode: perNight ? "PER_NIGHT" : "TOTAL",
    budgetStrict,
    amenities,
    destination: destination.value,
    destinationHard: destination.hard,
    destinationMode: destination.mode,
    goodReviews,
    minStars: minStarsMatch ? Number(minStarsMatch[1]) : null,
    datesSelected,
    nights: nightsBetween(trip?.checkIn, trip?.checkOut),
  };
}

function ratingScore(value) {
  const rating = numberOrNull(value);
  if (rating == null || rating <= 0) return null;
  if (rating <= 5) return Math.min(1, rating / 5);
  return Math.min(1, rating / 10);
}

function weightedScore(parts) {
  let points = 0;
  let possible = 0;

  parts.forEach(({ score, weight }) => {
    if (score === null || score === undefined) return;
    possible += weight;
    points += Math.max(0, Math.min(1, Number(score))) * weight;
  });

  if (!possible) return null;
  return Math.round((points / possible) * 100);
}

function locationParts(hotel) {
  const values = [hotel.address, hotel.ward, hotel.district, hotel.city]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  const seen = new Set();
  return values.filter((item) => {
    const key = canonicalLocation(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function locationLabel(hotel) {
  const parts = locationParts(hotel);
  return parts.length ? parts.join(", ") : "Chưa cập nhật địa chỉ";
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeLocation(haystack, needle) {
  const normalizedHaystack = canonicalLocation(haystack);
  const normalizedNeedle = canonicalLocation(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;

  // Quan 1 must NOT match Quan 10/11/12. The old includes() implementation
  // treated "quan 1" as a prefix of "quan 12", causing false positives.
  const district = normalizedNeedle.match(/^quan\s+(\d{1,2})$/);
  if (district) {
    const districtNumber = escapeRegExp(district[1]);
    const districtPattern = new RegExp(
      `(?:^|\\s)quan\\s+0?${districtNumber}(?=\\s|$)`,
      "i",
    );
    return districtPattern.test(normalizedHaystack);
  }

  // Other locations are matched as a complete token phrase rather than a
  // substring, so a shorter place name cannot accidentally match a longer one.
  const phrase = escapeRegExp(normalizedNeedle).replace(/\\ /g, "\\s+");
  const phrasePattern = new RegExp(`(?:^|\\s)${phrase}(?=\\s|$)`, "i");
  return phrasePattern.test(normalizedHaystack);
}

function destinationMatch(hotel, criteria) {
  if (!criteria.destination) return null;

  const needle = canonicalLocation(criteria.destination);
  if (!needle) return null;

  const haystack = canonicalLocation(
    [hotel.address, hotel.ward, hotel.district, hotel.city]
      .filter(Boolean)
      .join(" "),
  );

  if (!haystack) return 0;
  return containsWholeLocation(haystack, needle) ? 1 : 0;
}

function amenityMatch(hotel, criteria) {
  if (!criteria.amenities.length) return null;

  const haystack = normalize(
    [
      ...(Array.isArray(hotel.matchReasons) ? hotel.matchReasons : []),
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.roomAmenities) ? hotel.roomAmenities : []),
      hotel.roomTypeName,
      hotel.description,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!haystack) return 0;

  const matched = criteria.amenities.filter((amenity) => {
    const needle = normalize(amenity);
    return haystack.includes(needle);
  });

  return matched.length / criteria.amenities.length;
}

function availabilityMatch(hotel, criteria) {
  if (!criteria.datesSelected) return null;
  if (!hotel.availabilityChecked) return 0;
  return Number(hotel.availableRooms ?? 0) > 0 ? 1 : 0;
}

function comparablePrice(hotel, criteria) {
  if (!criteria.budget) return null;

  // Không có ngày => chưa có dynamic pricing + promotion/member preview chính xác.
  // Vì vậy không dùng giá niêm yết để kết luận vượt ngân sách.
  if (!criteria.datesSelected || criteria.nights <= 0) return null;

  const finalAmount = effectivePayableAmount(hotel);
  if (finalAmount == null) return null;

  if (criteria.budgetMode === "PER_NIGHT") {
    return finalAmount / criteria.nights;
  }

  return finalAmount;
}

function budgetStatus(hotel, criteria) {
  if (!criteria.budget) return "NONE";

  const comparable = comparablePrice(hotel, criteria);
  if (comparable == null || comparable < 0) return "UNKNOWN";

  return comparable <= criteria.budget ? "WITHIN" : "OVER";
}

function budgetMatch(hotel, criteria) {
  const status = budgetStatus(hotel, criteria);
  if (status === "NONE") return null;
  if (status === "WITHIN") return 1;

  if (status === "UNKNOWN") {
    // Chưa có ngày/discount preview: dùng giá niêm yết chỉ như tín hiệu mềm,
    // tuyệt đối không gắn nhãn "Trong ngân sách" hay loại hotel.
    const listedNightly = numberOrNull(hotel.pricePerNight);
    if (listedNightly == null || listedNightly <= 0) return 0.5;
    if (criteria.budgetMode === "PER_NIGHT") {
      return listedNightly <= criteria.budget ? 0.7 : 0.3;
    }
    return listedNightly <= criteria.budget ? 0.65 : 0.3;
  }

  const comparable = comparablePrice(hotel, criteria);
  if (comparable == null || comparable <= 0) return 0;
  return Math.max(0, Math.min(1, Number(criteria.budget) / comparable));
}

function buildReasons(hotel, criteria) {
  const reasons = [];
  const backendReasons = Array.isArray(hotel.matchReasons)
    ? hotel.matchReasons.filter(Boolean)
    : [];

  if (criteria.destination && destinationMatch(hotel, criteria) === 1) {
    reasons.push(`Đúng ${criteria.destination}`);
  }

  if (criteria.budget && budgetStatus(hotel, criteria) === "WITHIN") {
    reasons.push("Trong ngân sách");
  }

  if (hotel.discountChecked && Number(hotel.totalDiscount ?? 0) > 0) {
    reasons.push(
      hotel.hasRecommendedPromotion
        ? "Có ưu đãi hợp lệ để giảm giá"
        : "Đã tính quyền lợi thành viên",
    );
  }

  if (criteria.amenities.length) {
    const amenityResult = amenityMatch(hotel, criteria);
    if (amenityResult === 1) {
      reasons.push(`Đủ ${criteria.amenities.join(", ")}`);
    } else if (amenityResult > 0) {
      reasons.push("Khớp một phần tiện nghi");
    }
  }

  const rating = numberOrNull(hotel.averageRating);
  if (
    criteria.goodReviews &&
    rating != null &&
    ((rating <= 5 && rating >= 4) || rating >= 8)
  ) {
    reasons.push("Review tốt");
  }

  if (
    criteria.datesSelected &&
    hotel.availabilityChecked &&
    Number(hotel.availableRooms ?? 0) > 0
  ) {
    reasons.push("Còn phòng theo ngày đã chọn");
  }

  for (const reason of backendReasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (reasons.length >= 5) break;
  }

  return reasons.slice(0, 5);
}

function scoreHotel(hotel, criteria) {
  const review = ratingScore(hotel.averageRating);
  const starRating = numberOrNull(hotel.starRating);
  const starScore =
    criteria.minStars == null
      ? null
      : starRating == null
        ? 0
        : starRating >= criteria.minStars
          ? 1
          : Math.max(0, starRating / criteria.minStars);

  const matchPercent = weightedScore([
    // Các trọng số chính được cố định để Match % dễ giải thích khi bảo vệ.
    { score: destinationMatch(hotel, criteria), weight: criteria.destination ? 30 : 0 },
    { score: budgetMatch(hotel, criteria), weight: criteria.budget ? 25 : 0 },
    { score: amenityMatch(hotel, criteria), weight: criteria.amenities.length ? 15 : 0 },
    { score: criteria.goodReviews ? review ?? 0 : null, weight: criteria.goodReviews ? 15 : 0 },
    { score: availabilityMatch(hotel, criteria), weight: criteria.datesSelected ? 15 : 0 },
    { score: starScore, weight: criteria.minStars ? 10 : 0 },
  ].filter((item) => item.weight > 0));

  return {
    ...hotel,
    matchPercent,
    locationMatches: destinationMatch(hotel, criteria) === 1,
    copilotReasons: buildReasons(hotel, criteria),
  };
}

function criteriaLabels(criteria) {
  const labels = [];

  if (criteria.destination) labels.push(`📍 ${criteria.destination}`);
  if (criteria.budget) {
    labels.push(
      `💰 ${criteria.budget.toLocaleString("vi-VN")} ₫${
        criteria.budgetMode === "PER_NIGHT" ? "/đêm" : ""
      }`,
    );
  }
  if (criteria.amenities.length) {
    labels.push(`✨ ${criteria.amenities.join(", ")}`);
  }
  if (criteria.goodReviews) labels.push("⭐ Ưu tiên review tốt");
  if (criteria.minStars) labels.push(`🏨 Từ ${criteria.minStars} sao`);

  return labels.slice(0, 5);
}

function isHotelSearchResponse(response) {
  if (!Array.isArray(response?.hotels) || response.hotels.length === 0) {
    return false;
  }

  const intent = normalize(response?.intent);
  if (!intent) return true;
  return (
    intent.includes("hotel") ||
    intent.includes("search") ||
    intent.includes("recommend") ||
    intent.includes("compare")
  );
}

function isActiveRoomType(type) {
  return !["INACTIVE", "REJECTED", "PENDING"].includes(
    String(type?.status ?? "").toUpperCase(),
  );
}

function roomFits(type, trip) {
  const adults = Math.max(1, Number(trip?.adults ?? 1));
  const children = Math.max(0, Number(trip?.children ?? 0));
  return (
    Number(type?.maxAdults ?? 2) >= adults &&
    Number(type?.maxChildren ?? 0) >= children
  );
}

function sameRoomType(room, type) {
  return String(room?.roomTypeId ?? room?.roomType?.id) === String(type?.id);
}

function roomEligible(room, unavailableSet, checkIn) {
  if (unavailableSet.has(String(room?.id))) return false;

  const status = String(room?.status ?? "").toUpperCase();
  if (["MAINTENANCE", "INACTIVE"].includes(status)) return false;

  const today = new Date().toISOString().slice(0, 10);
  if (checkIn && checkIn <= today && status !== "AVAILABLE") return false;
  return true;
}

function resolveCoverImage(detail, fallback) {
  const direct =
    detail?.coverImageUrl ??
    detail?.imageUrl ??
    detail?.thumbnailUrl ??
    fallback?.coverImageUrl ??
    "";
  if (direct) return direct;

  const first = Array.isArray(detail?.images) ? detail.images[0] : null;
  if (typeof first === "string") return first;
  return first?.url ?? first?.imageUrl ?? first?.fileUrl ?? "";
}

function chooseRoomType(roomTypes, rooms, unavailableSet, hotel, trip) {
  const requestedName = normalize(hotel?.roomTypeName);

  const candidates = roomTypes
    .filter(isActiveRoomType)
    .filter((type) => roomFits(type, trip))
    .map((type) => {
      const availableRooms = rooms
        .filter((room) => sameRoomType(room, type))
        .filter((room) => roomEligible(room, unavailableSet, trip?.checkIn))
        .sort(
          (left, right) =>
            Number(left?.customPrice ?? type?.basePrice ?? 0) -
            Number(right?.customPrice ?? type?.basePrice ?? 0),
        );

      const nameScore =
        requestedName && normalize(type?.name) === requestedName ? 2 :
          requestedName && normalize(type?.name).includes(requestedName) ? 1 : 0;

      return { type, availableRooms, nameScore };
    })
    .filter((item) => item.availableRooms.length > 0)
    .sort((left, right) => {
      if (left.nameScore !== right.nameScore) return right.nameScore - left.nameScore;
      const leftPrice = Number(left.availableRooms[0]?.customPrice ?? left.type?.basePrice ?? 0);
      const rightPrice = Number(right.availableRooms[0]?.customPrice ?? right.type?.basePrice ?? 0);
      return leftPrice - rightPrice;
    });

  return candidates[0] ?? null;
}

async function enrichHotel(hotel, trip) {
  const hotelId = hotel?.hotelId ?? hotel?.id;
  if (!hotelId) return { ...hotel, locationLabel: locationLabel(hotel) };

  let detail;
  try {
    detail = await getHotelById(hotelId);
  } catch {
    detail = null;
  }

  let enriched = {
    ...hotel,
    hotelId,
    address: detail?.address ?? hotel?.address,
    ward: detail?.ward ?? hotel?.ward,
    district: detail?.district ?? hotel?.district,
    city: detail?.city ?? hotel?.city,
    amenities: detail?.amenities ?? hotel?.amenities,
    description: detail?.description ?? hotel?.description,
    coverImageUrl: resolveCoverImage(detail, hotel),
  };
  enriched.locationLabel = locationLabel(enriched);

  const datesSelected = Boolean(
    trip?.checkIn && trip?.checkOut && trip.checkOut > trip.checkIn,
  );
  if (!datesSelected) return enriched;

  try {
    const [typesRaw, roomsRaw, availability] = await Promise.all([
      getRoomTypesByHotel(hotelId),
      getRoomsByHotel(hotelId),
      getHotelAvailability(hotelId, trip.checkIn, trip.checkOut),
    ]);

    const roomTypes = listOf(typesRaw);
    const rooms = listOf(roomsRaw);
    const unavailableSet = new Set(
      Array.isArray(availability?.unavailableRoomIds)
        ? availability.unavailableRoomIds.map(String)
        : [],
    );

    const selected = chooseRoomType(
      roomTypes,
      rooms,
      unavailableSet,
      enriched,
      trip,
    );

    if (!selected) {
      return {
        ...enriched,
        availabilityChecked: true,
        availableRooms: 0,
        pricingChecked: false,
      };
    }

    const room = selected.availableRooms[0];
    const listedNightly = Number(room?.customPrice ?? selected.type?.basePrice ?? 0);

    enriched = {
      ...enriched,
      roomTypeName: selected.type?.name ?? enriched.roomTypeName,
      maxAdults: selected.type?.maxAdults ?? enriched.maxAdults,
      maxChildren: selected.type?.maxChildren ?? enriched.maxChildren,
      roomAmenities: selected.type?.amenities ?? [],
      pricePerNight: Number.isFinite(listedNightly) && listedNightly > 0
        ? listedNightly
        : enriched.pricePerNight,
      availabilityChecked: true,
      availableRooms: selected.availableRooms.length,
    };

    try {
      const quote = await getBookingPricingQuote({
        hotelId,
        roomIds: [room.id],
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
      });

      const roomQuote = Array.isArray(quote?.rooms)
        ? quote.rooms.find(
            (item) => String(item?.roomTypeId) === String(selected.type?.id),
          ) ?? quote.rooms[0]
        : null;
      const totalStayAmount = numberOrNull(
        roomQuote?.totalAmount ?? quote?.totalAmount,
      );

      if (totalStayAmount != null) {
        enriched = {
          ...enriched,
          pricingChecked: true,
          totalStayAmount,
          baseStayAmount: numberOrNull(roomQuote?.baseAmount ?? quote?.baseAmount),
          weekendSurchargeAmount: numberOrNull(
            roomQuote?.weekendSurchargeAmount ?? quote?.weekendSurchargeAmount,
          ) ?? 0,
          specialDateSurchargeAmount: numberOrNull(
            roomQuote?.specialDateSurchargeAmount ?? quote?.specialDateSurchargeAmount,
          ) ?? 0,
          stayNights: nightsBetween(trip.checkIn, trip.checkOut),
        };

        const discount = await resolveBestDiscount(hotelId, totalStayAmount);
        enriched = { ...enriched, ...discount };
      }
    } catch {
      enriched = { ...enriched, pricingChecked: false };
    }
  } catch {
    // Nếu một API enrichment lỗi, giữ dữ liệu grounded từ AI Service thay vì bịa thêm.
  }

  return enriched;
}

function buildConciseAnswer(hotels, criteria, context = {}) {
  if (!hotels.length) {
    if (context.budgetRejected) {
      if (context.lowestOverBudget != null) {
        return `Mình đã kiểm tra giá theo ngày và các ưu đãi hợp lệ, nhưng mức thấp nhất vẫn là ${formatMoney(context.lowestOverBudget)}, vượt ngân sách ${formatMoney(criteria.budget)}. Mình không đưa lựa chọn vượt ngân sách vào Top.`;
      }
      return `Mình chưa xác nhận được lựa chọn nào nằm trong ngân sách ${formatMoney(criteria.budget)} sau khi kiểm tra giá và ưu đãi.`;
    }

    if (criteria.destination && criteria.destinationHard && !context.hadLocationCandidates) {
      return `Mình chưa tìm thấy khách sạn nào được dữ liệu EnziuRooms xác nhận thuộc ${criteria.destination}. Mình không hiển thị khách sạn chỉ cùng thành phố để tránh gợi ý sai khu vực. Bạn có thể đổi khu vực hoặc nới tiêu chí tìm kiếm.`;
    }

    if (criteria.datesSelected && context.hadLocationCandidates && !context.hadAvailabilityCandidates) {
      return `Mình có khách sạn đúng khu vực nhưng chưa tìm thấy phòng phù hợp còn trống trong ngày bạn chọn. Bạn có thể đổi ngày hoặc số khách để mình kiểm tra lại.`;
    }

    return "Mình chưa tìm thấy lựa chọn đáp ứng đủ các tiêu chí hiện tại. Bạn có thể nới ngân sách, tiện nghi hoặc đổi ngày để mình kiểm tra lại.";
  }

  const top = hotels[0];
  const facts = [];

  if (criteria.destination && top.locationMatches) {
    facts.push(`đúng ${criteria.destination}`);
  }
  if (criteria.budget && budgetStatus(top, criteria) === "WITHIN") {
    facts.push("nằm trong ngân sách sau ưu đãi");
  }
  if (criteria.amenities.length && amenityMatch(top, criteria) === 1) {
    facts.push(`có ${criteria.amenities.join(", ")}`);
  }
  const rating = numberOrNull(top.averageRating);
  if (criteria.goodReviews && rating != null) {
    facts.push(`review ${rating.toFixed(1)}/${rating <= 5 ? 5 : 10}`);
  }

  const firstSentence = facts.length
    ? `Mình ưu tiên ${top.name} vì ${facts.join(", ")}.`
    : `Mình ưu tiên ${top.name} theo các dữ kiện hệ thống đang có.`;

  const detailParts = [];
  if (top.discountChecked && top.finalPayableAmount != null && criteria.nights > 0) {
    const hasDiscount = Number(top.totalDiscount ?? 0) > 0;
    detailParts.push(
      hasDiscount
        ? `Giá tốt nhất cho ${criteria.nights} đêm sau ưu đãi là ${formatMoney(top.finalPayableAmount)} (tiết kiệm ${formatMoney(top.totalDiscount)} từ ${formatMoney(top.totalStayAmount)})`
        : `Tổng ${criteria.nights} đêm sau khi kiểm tra quyền lợi là ${formatMoney(top.finalPayableAmount)}`,
    );
    const codes = [top.hotelPromotionCode, top.platformPromotionCode].filter(Boolean);
    if (codes.length) {
      detailParts.push(`mã có thể áp dụng: ${codes.join(" + ")}`);
    }
  } else if (top.pricingChecked && top.totalStayAmount != null && criteria.nights > 0) {
    detailParts.push(`Tổng trước ưu đãi ${criteria.nights} đêm là ${formatMoney(top.totalStayAmount)}; mình chưa xác nhận được giảm giá`);
  } else if (top.pricePerNight != null) {
    detailParts.push(`Giá niêm yết từ ${formatMoney(top.pricePerNight)}/đêm; hãy chọn ngày để mình kiểm tra giá theo ngày, quyền lợi thành viên và các ưu đãi hợp lệ`);
  }

  if (
    criteria.datesSelected &&
    top.availabilityChecked &&
    Number(top.availableRooms ?? 0) > 0
  ) {
    detailParts.push(`còn ${top.availableRooms} phòng phù hợp trong ngày đã chọn`);
  }

  return detailParts.length
    ? `${firstSentence} ${detailParts.join(" và ")}.`
    : firstSentence;
}

export async function enhanceAssistantResponse({ question, response, trip }) {
  if (!response || typeof response !== "object") return response;
  if (!isHotelSearchResponse(response)) return response;

  const criteria = extractCriteria(question, trip);
  const enrichedHotels = await Promise.all(
    response.hotels.map((hotel) => enrichHotel(hotel, trip)),
  );

  let candidates = enrichedHotels;

  // "Ở/tại Quận 1" là ràng buộc cứng. Nếu dữ liệu chỉ chứng minh HCM thì loại,
  // thay vì cho điểm thấp nhưng vẫn đưa vào Top 3.
  if (criteria.destination && criteria.destinationHard) {
    candidates = candidates.filter(
      (hotel) => destinationMatch(hotel, criteria) === 1,
    );
  }

  const hadLocationCandidates = candidates.length > 0;

  if (criteria.datesSelected) {
    candidates = candidates.filter(
      (hotel) =>
        hotel.availabilityChecked && Number(hotel.availableRooms ?? 0) > 0,
    );
  }

  const hadAvailabilityCandidates = candidates.length > 0;

  let rankedHotels = candidates
    .map((hotel) => scoreHotel(hotel, criteria))
    .sort(
      (left, right) =>
        Number(right.matchPercent ?? 0) - Number(left.matchPercent ?? 0),
    );

  let budgetRejected = false;
  let lowestOverBudget = null;

  if (criteria.budget) {
    const inBudget = rankedHotels.filter(
      (hotel) => budgetStatus(hotel, criteria) === "WITHIN",
    );

    if (inBudget.length > 0) {
      rankedHotels = inBudget;
    } else if (criteria.budgetStrict) {
      const overBudgetHotels = rankedHotels.filter(
        (hotel) => budgetStatus(hotel, criteria) === "OVER",
      );

      const overBudgetPrices = overBudgetHotels
        .map((hotel) => comparablePrice(hotel, criteria))
        .filter((value) => value != null && value > 0);

      if (overBudgetPrices.length > 0) {
        lowestOverBudget = Math.min(...overBudgetPrices);
      }

      rankedHotels = rankedHotels.filter(
        (hotel) => budgetStatus(hotel, criteria) !== "OVER",
      );
      budgetRejected = overBudgetHotels.length > 0 && rankedHotels.length === 0;
    }
  }

  rankedHotels = rankedHotels
    .slice(0, 3)
    .map((hotel, index) => ({ ...hotel, copilotRank: index + 1 }));

  const labels = criteriaLabels(criteria);
  const availabilityChecked =
    criteria.datesSelected &&
    rankedHotels.length > 0 &&
    rankedHotels.every((hotel) => hotel.availabilityChecked);

  return {
    ...response,
    answer: buildConciseAnswer(rankedHotels, criteria, {
      budgetRejected,
      lowestOverBudget,
      hadLocationCandidates,
      hadAvailabilityCandidates,
    }),
    hotels: rankedHotels,
    copilot: {
      enhanced: true,
      criteria: labels,
      datesSelected: criteria.datesSelected,
      availabilityChecked,
      strictLocation: Boolean(criteria.destination && criteria.destinationHard),
      locationMismatch:
        Boolean(criteria.destination && criteria.destinationHard) &&
        rankedHotels.length === 0,
      methodology:
        "Mức phù hợp được EnziuRooms tính từ khu vực, ngân sách, tiện nghi, đánh giá và tình trạng phòng. Giá cuối chỉ được xác nhận sau khi hệ thống kiểm tra ngày ở và các ưu đãi hợp lệ.",
    },
  };
}
