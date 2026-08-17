import {
  getHotelById,
  getRoomsByHotel,
  getRoomTypesByHotel,
} from "../services/hotelService";
import {
  getBookingPricingQuote,
  getHotelAvailability,
} from "../services/bookingService";
import {
  getPromotionRecommendations,
  previewDiscount,
} from "../services/promotionService";
import { askEnziuAssistant } from "../services/aiService";

/* =========================================================
 * Enziu AI Booking Agent
 *
 * Bản này KHÔNG còn dùng regex / danh sách câu mẫu / intent form.
 *
 * Cách hoạt động:
 * 1. Nếu hội thoại đang có khách sạn hiện tại, frontend tự lấy dữ liệu thật:
 *    hotel + tất cả room type + ngày đi + availability + pricing + promotion.
 * 2. Gemini đọc toàn bộ conversation + facts và hiểu NGỮ NGHĨA câu hiện tại.
 * 3. Gemini hoặc:
 *    - HANDLE: trả lời dựa đúng facts;
 *    - DELEGATE: chuyển về assistant chính nếu user đang tìm khách sạn mới,
 *      hỏi booking cá nhân, chính sách chung, v.v.
 * 4. Room candidates được lưu lại để các câu như “2 phòng đó”, “cái nào hơn”,
 *    “còn cái kia?” tiếp tục đúng ngữ cảnh.
 * ========================================================= */

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function isPublicRoomType(roomType) {
  if (!roomType || roomType.deleted === true || roomType.active === false) {
    return false;
  }

  const status = String(roomType.status ?? "").trim().toUpperCase();
  const approval = String(roomType.approvalStatus ?? "").trim().toUpperCase();

  if (
    status &&
    ["INACTIVE", "REJECTED", "PENDING", "DELETED"].includes(status)
  ) {
    return false;
  }

  if (approval && approval !== "APPROVED") return false;
  return true;
}

function latestAssistantWithHotels(messages) {
  return [...(messages ?? [])]
    .reverse()
    .find(
      (message) =>
        message?.role === "assistant" &&
        Array.isArray(message?.hotels) &&
        message.hotels.length > 0,
    );
}

function latestAgentContext(messages) {
  return (
    [...(messages ?? [])]
      .reverse()
      .find((message) => message?.agentContext)?.agentContext ?? null
  );
}

function currentHotelState(messages, contextualHotel) {
  const latestHotelMessage = latestAssistantWithHotels(messages);
  const latestHotel = latestHotelMessage?.hotels?.[0] ?? null;
  const previousAgentContext = latestAgentContext(messages);

  const id =
    contextualHotel?.id ??
    previousAgentContext?.currentHotelId ??
    latestHotel?.hotelId ??
    latestHotel?.id ??
    null;

  const name =
    contextualHotel?.name ??
    previousAgentContext?.currentHotelName ??
    latestHotel?.name ??
    null;

  return {
    id: id ? String(id) : null,
    name: stringOrNull(name),
    latestHotel,
    previousAgentContext,
  };
}

function compactTrip(trip) {
  return {
    checkIn: stringOrNull(trip?.checkIn),
    checkOut: stringOrNull(trip?.checkOut),
    adults: Math.max(1, Number(trip?.adults) || 2),
    children: Math.max(0, Number(trip?.children) || 0),
  };
}

function resolveRoomTypeImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;

  return (
    image.imageUrl ??
    image.url ??
    image.fileUrl ??
    image.publicUrl ??
    image.path ??
    ""
  );
}

function roomTypeImageUrls(roomType) {
  if (!roomType) return [];

  const raw = Array.isArray(roomType.images) ? roomType.images : [];
  const urls = [
    roomType.coverImageUrl,
    roomType.imageUrl,
    roomType.thumbnailUrl,
    ...raw.map(resolveRoomTypeImageUrl),
  ].filter(Boolean);

  return [...new Set(urls)];
}

function roomTypeFacts(roomType) {
  const amenities = Array.isArray(roomType?.amenities)
    ? roomType.amenities
        .map((item) => (typeof item === "string" ? item : item?.name))
        .map(stringOrNull)
        .filter(Boolean)
    : [];

  return {
    id: roomType?.id ? String(roomType.id) : null,
    name: stringOrNull(roomType?.name) ?? "Loại phòng",
    description: stringOrNull(roomType?.description),
    basePrice: numberOrNull(
      roomType?.basePrice ??
        roomType?.pricePerNight ??
        roomType?.price ??
        roomType?.nightlyPrice,
    ),
    maxAdults: Math.max(0, Number(roomType?.maxAdults) || 0),
    maxChildren: Math.max(0, Number(roomType?.maxChildren) || 0),
    bedType: stringOrNull(roomType?.bedType),
    bedCount: Math.max(0, Number(roomType?.bedCount) || 0),
    areaSqm: Math.max(0, Number(roomType?.areaSqm) || 0),
    imageUrls: roomTypeImageUrls(roomType),
    amenities,
  };
}

function unavailableIdsFromAvailability(value) {
  return new Set(
    listOf(value?.unavailableRoomIds ?? value?.unavailableRooms ?? [])
      .map((item) => (typeof item === "object" ? item?.id ?? item?.roomId : item))
      .filter(Boolean)
      .map(String),
  );
}

function roomIsUsable(room, unavailableSet) {
  if (!room || unavailableSet.has(String(room.id))) return false;
  return !["MAINTENANCE", "INACTIVE"].includes(
    String(room.status ?? "").toUpperCase(),
  );
}

function representativeRoom(roomType, rooms, unavailableSet) {
  return (
    rooms
      .filter((room) => String(room?.roomTypeId) === String(roomType?.id))
      .filter((room) => roomIsUsable(room, unavailableSet))
      .sort(
        (left, right) =>
          Number(left?.customPrice ?? roomType?.basePrice ?? 0) -
          Number(right?.customPrice ?? roomType?.basePrice ?? 0),
      )[0] ?? null
  );
}

function bestSuggestionForScope(suggestions, scope) {
  return (
    (suggestions ?? [])
      .filter(
        (item) =>
          String(item?.scope ?? item?.promotion?.scope ?? "").toUpperCase() ===
          scope,
      )
      .sort(
        (left, right) =>
          Number(right?.estimatedDiscount ?? right?.discountAmount ?? 0) -
          Number(left?.estimatedDiscount ?? left?.discountAmount ?? 0),
      )[0] ?? null
  );
}

async function bestDiscountForAmount(hotelId, amount) {
  const safeAmount = numberOrNull(amount);
  if (!hotelId || safeAmount == null || safeAmount <= 0) return null;

  const suggestions = await (async () => {
    try {
      const raw = await getPromotionRecommendations(hotelId, safeAmount);
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  })();

  const hotelSuggestion = bestSuggestionForScope(suggestions, "HOTEL");
  const platformSuggestion = bestSuggestionForScope(suggestions, "PLATFORM");

  const hotelPromotionCode = hotelSuggestion?.promotion?.code ?? null;
  const platformPromotionCode = platformSuggestion?.promotion?.code ?? null;

  const candidates = [
    { hotelPromotionCode: null, platformPromotionCode: null },
    ...(hotelPromotionCode
      ? [{ hotelPromotionCode, platformPromotionCode: null }]
      : []),
    ...(platformPromotionCode
      ? [{ hotelPromotionCode: null, platformPromotionCode }]
      : []),
    ...(hotelPromotionCode && platformPromotionCode
      ? [{ hotelPromotionCode, platformPromotionCode }]
      : []),
  ];

  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.hotelPromotionCode ?? "-"}|${candidate.platformPromotionCode ?? "-"}`,
        candidate,
      ]),
    ).values(),
  ];

  const evaluated = (
    await Promise.all(
      unique.map(async (candidate) => {
        try {
          const preview = await previewDiscount({
            hotelId,
            amount: safeAmount,
            ...candidate,
          });

          const finalAmount = numberOrNull(preview?.finalAmount);
          if (finalAmount == null || finalAmount < 0) return null;

          return {
            finalAmount,
            totalDiscount: Math.max(
              0,
              numberOrNull(preview?.totalDiscount) ?? safeAmount - finalAmount,
            ),
            membershipName: stringOrNull(preview?.membershipName),
            membershipPercent: numberOrNull(preview?.membershipPercent) ?? 0,
            hotelPromotionCode:
              preview?.hotelPromotionCode ?? candidate.hotelPromotionCode ?? null,
            platformPromotionCode:
              preview?.platformPromotionCode ??
              candidate.platformPromotionCode ??
              null,
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean);

  if (!evaluated.length) return null;
  evaluated.sort((left, right) => left.finalAmount - right.finalAmount);
  return evaluated[0];
}

async function loadFullRoomFacts(hotelId, roomTypes, trip) {
  const baseFacts = roomTypes.map(roomTypeFacts);
  const datesSelected = Boolean(
    trip?.checkIn &&
      trip?.checkOut &&
      String(trip.checkOut) > String(trip.checkIn),
  );

  if (!datesSelected) return baseFacts;

  const loaded = await (async () => {
    try {
      const [rooms, availability] = await Promise.all([
        getRoomsByHotel(hotelId).then(listOf),
        getHotelAvailability(hotelId, trip.checkIn, trip.checkOut),
      ]);
      return { rooms, availability };
    } catch {
      return null;
    }
  })();

  if (!loaded) return baseFacts;
  const { rooms, availability } = loaded;

  const unavailableSet = unavailableIdsFromAvailability(availability);
  const representatives = roomTypes.map((roomType) => ({
    roomType,
    room: representativeRoom(roomType, rooms, unavailableSet),
  }));

  const representativeIds = representatives
    .map((entry) => entry.room?.id)
    .filter(Boolean);

  let quote = null;
  if (representativeIds.length) {
    try {
      quote = await getBookingPricingQuote({
        hotelId,
        roomIds: representativeIds,
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
      });
    } catch {
      quote = null;
    }
  }

  const quoteByType = new Map(
    listOf(quote?.rooms).map((item) => [String(item?.roomTypeId), item]),
  );

  return Promise.all(
    baseFacts.map(async (fact) => {
      const availableRooms = rooms.filter(
        (room) =>
          String(room?.roomTypeId) === String(fact.id) &&
          roomIsUsable(room, unavailableSet),
      );

      const roomQuote = quoteByType.get(String(fact.id)) ?? null;
      const totalStayAmount = numberOrNull(roomQuote?.totalAmount);
      const discount =
        totalStayAmount != null
          ? await bestDiscountForAmount(hotelId, totalStayAmount)
          : null;

      return {
        ...fact,
        availabilityChecked: true,
        availableRooms: availableRooms.length,
        pricingChecked: Boolean(roomQuote),
        baseStayAmount: numberOrNull(roomQuote?.baseAmount),
        weekendSurchargeAmount:
          numberOrNull(roomQuote?.weekendSurchargeAmount) ?? 0,
        specialDateSurchargeAmount:
          numberOrNull(roomQuote?.specialDateSurchargeAmount) ?? 0,
        totalStayAmount,
        finalPayableAmount: discount?.finalAmount ?? totalStayAmount,
        totalDiscount: discount?.totalDiscount ?? 0,
        membershipName: discount?.membershipName ?? null,
        membershipPercent: discount?.membershipPercent ?? 0,
        hotelPromotionCode: discount?.hotelPromotionCode ?? null,
        platformPromotionCode: discount?.platformPromotionCode ?? null,
      };
    }),
  );
}

async function loadHotelContext(state, trip) {
  if (!state.id) return null;

  let hotel = state.latestHotel;
  try {
    hotel = await getHotelById(state.id);
  } catch {
    // card gần nhất vẫn đủ để giữ context nếu endpoint detail lỗi
  }

  const roomTypes = await (async () => {
    try {
      const raw = await getRoomTypesByHotel(state.id);
      return listOf(raw).filter(isPublicRoomType);
    } catch {
      return [];
    }
  })();

  const roomFacts = await loadFullRoomFacts(state.id, roomTypes, trip);

  return {
    hotel: {
      id: state.id,
      name: state.name ?? hotel?.name ?? null,
      address: hotel?.address ?? state.latestHotel?.locationLabel ?? null,
      city: hotel?.city ?? null,
      starRating: numberOrNull(hotel?.starRating),
      averageRating: numberOrNull(
        hotel?.averageRating ??
          hotel?.rating ??
          state.latestHotel?.averageRating ??
          state.latestHotel?.rating,
      ),
      reviewCount: numberOrNull(
        hotel?.reviewCount ?? state.latestHotel?.reviewCount,
      ),
    },
    trip,
    roomTypes: roomFacts,
  };
}


function money(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric).toLocaleString("vi-VN")} ₫`;
}

function compactConversation(messages) {
  return (messages ?? [])
    .slice(-6)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      content: String(message?.content ?? "").trim().slice(0, 500),
    }))
    .filter((item) => item.content);
}

function roomNamesMentioned(text, roomFacts) {
  const haystack = normalize(text);
  if (!haystack) return [];

  return roomFacts
    .filter((room) => haystack.includes(normalize(room.name)))
    .map((room) => room.name);
}

function getPreviousRoomCandidates(state, facts, messages) {
  const validNames = new Map(
    (facts?.roomTypes ?? []).map((room) => [normalize(room.name), room.name]),
  );

  const fromState = Array.isArray(state?.previousAgentContext?.roomCandidates)
    ? state.previousAgentContext.roomCandidates
        .map((name) => validNames.get(normalize(name)))
        .filter(Boolean)
    : [];

  if (fromState.length) return [...new Set(fromState)];

  const previousAssistant = [...(messages ?? [])]
    .reverse()
    .find(
      (message) =>
        message?.role === "assistant" &&
        String(message?.content ?? "").trim(),
    );

  return roomNamesMentioned(previousAssistant?.content, facts?.roomTypes ?? []);
}

function formatRoomFact(room) {
  const parts = [];

  if (room.basePrice != null) {
    parts.push(`giá niêm yết ${money(room.basePrice)}/đêm`);
  }

  if (room.maxAdults > 0) {
    parts.push(`tối đa ${room.maxAdults} người lớn`);
  }

  if (room.maxChildren > 0) {
    parts.push(`${room.maxChildren} trẻ em`);
  } else {
    parts.push("không hỗ trợ trẻ em theo dữ liệu hiện tại");
  }

  if (room.bedCount > 0 || room.bedType) {
    parts.push(
      `${room.bedCount > 0 ? room.bedCount : ""} ${room.bedType ?? "giường"}`.trim(),
    );
  }

  if (room.areaSqm > 0) {
    parts.push(`${room.areaSqm} m²`);
  }

  if (room.availabilityChecked) {
    parts.push(`còn ${Math.max(0, Number(room.availableRooms) || 0)} phòng`);
  }

  if (room.finalPayableAmount != null) {
    parts.push(`giá kỳ nghỉ sau ưu đãi ${money(room.finalPayableAmount)}`);
  } else if (room.totalStayAmount != null) {
    parts.push(`giá kỳ nghỉ ${money(room.totalStayAmount)}`);
  }

  return `${room.name}: ${parts.join(" · ")}`;
}

function buildGroundedPrompt({ question, state, facts, previousRoomCandidates }) {
  const trip = facts?.trip ?? {};
  const tripText = trip.checkIn && trip.checkOut
    ? `${trip.checkIn} → ${trip.checkOut}; ${trip.adults} người lớn; ${trip.children} trẻ em`
    : `chưa chọn đủ ngày; ${trip.adults} người lớn; ${trip.children} trẻ em`;

  const roomText = (facts?.roomTypes ?? []).map(formatRoomFact).join("\n");

  return `Bạn đang tiếp tục tư vấn cho khách ngay trong khách sạn ${
    facts?.hotel?.name ?? state?.name ?? "hiện tại"
  }.

Hãy hiểu NGỮ NGHĨA câu người dùng và trả lời trực tiếp, tự nhiên, ngắn gọn.
Không bắt người dùng nói đúng mẫu.
Không tìm khách sạn khác nếu họ đang hỏi tiếp về khách sạn/phòng hiện tại.
Không tạo hotel card.
Không tự chọn TESTT hoặc bất kỳ room type nào chỉ vì nó từng xuất hiện trên card.
Nếu người dùng nói "phòng đó", "2 phòng đó", "cái nào", "rồi mà" thì nối với hội thoại trước.
Nếu hỏi về gia đình/trẻ em, chỉ coi room type maxChildren > 0 là phù hợp khi chưa biết rõ số trẻ em.
Nếu hỏi nên chọn giữa các phòng vừa nói, chỉ so sánh các phòng trong PREVIOUS_ROOM_CANDIDATES.
Nếu ngày đã có trong TRIP thì tuyệt đối không hỏi lại ngày.
Nếu NGỮ NGHĨA câu hỏi là người dùng muốn XEM/COI/MỞ/HIỂN THỊ một loại phòng cụ thể, hãy trả lời bình thường và thêm marker [[SHOW_ROOM_CARD:Tên phòng]] ở CUỐI câu trả lời.
Ví dụ user nói "cho tôi xem Suite", "mở phòng Suite xem", "tôi muốn coi cái Suite" đều phải thêm [[SHOW_ROOM_CARD:Suite]].
Nếu user muốn xem nhiều phòng, thêm một marker cho mỗi phòng. Marker chỉ dùng nội bộ, không giải thích marker cho người dùng.
Chỉ dùng FACTS bên dưới, không bịa thêm.

TRIP: ${tripText}
PREVIOUS_ROOM_CANDIDATES: ${JSON.stringify(previousRoomCandidates)}
ROOM_TYPES:\n${roomText || "không có room type hoạt động"}

CÂU HIỆN TẠI: ${String(question ?? "").trim()}`;
}

function looksLikeInvalidAgentAnswer(answer, question, facts) {
  const text = normalize(answer);
  const q = normalize(question);

  if (!text) return true;

  const tripHasDates = Boolean(facts?.trip?.checkIn && facts?.trip?.checkOut);

  if (
    tripHasDates &&
    (text.includes("cho minh xin them ngay") ||
      text.includes("cho minh xin lai ngay") ||
      text.includes("ngay nhan phong") && text.includes("ngay tra phong") && text.includes("cho minh"))
  ) {
    return true;
  }

  const familyLike =
    q.includes("gia dinh") ||
    q.includes("ca nha") ||
    q.includes("vo con") ||
    q.includes("con nho") ||
    q.includes("tre em") ||
    q.includes("em be") ||
    q.includes("be ") ||
    q.endsWith(" be");

  if (familyLike) {
    const allRooms = facts?.roomTypes ?? [];
    const familyRooms = allRooms.filter(
      (room) => Number(room.maxChildren ?? 0) > 0,
    );
    const familyNames = familyRooms.map((room) => normalize(room.name));
    const mentionedCount = allRooms.filter((room) =>
      text.includes(normalize(room.name)),
    ).length;

    /*
     * Nếu model chỉ đọc lại catalog kiểu
     * "hiện có 3 loại phòng: A, B, C" thì đó chưa phải
     * câu trả lời cho nhu cầu gia đình. Buộc dùng reasoning fallback.
     */
    const genericCatalogAnswer =
      text.includes("loai phong") &&
      mentionedCount === allRooms.length &&
      allRooms.length > 1;

    if (genericCatalogAnswer) {
      return true;
    }

    if (
      familyRooms.length > 0 &&
      !familyNames.some((name) => text.includes(name))
    ) {
      return true;
    }
  }

  return false;
}

function extractRoomCardMarkers(answer, roomFacts) {
  const source = String(answer ?? "");
  const matches = [...source.matchAll(/\[\[SHOW_ROOM_CARD:([^\]]+)\]\]/gi)];
  const valid = new Map(
    (roomFacts ?? []).map((room) => [normalize(room.name), room.name]),
  );

  const roomCardNames = [
    ...new Set(
      matches
        .map((match) => valid.get(normalize(match?.[1])))
        .filter(Boolean),
    ),
  ];

  const cleanAnswer = source
    .replace(/\s*\[\[SHOW_ROOM_CARD:[^\]]+\]\]\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cleanAnswer, roomCardNames };
}

async function askGroundedSemanticAgent({
  question,
  messages,
  state,
  facts,
  trip,
  hotelId,
  previousRoomCandidates,
}) {
  const prompt = buildGroundedPrompt({
    question,
    state,
    facts,
    previousRoomCandidates,
  });

  const response = await askEnziuAssistant({
    message: prompt,
    userMessage: question,
    checkIn: trip?.checkIn || null,
    checkOut: trip?.checkOut || null,
    adults: Math.max(1, Number(trip?.adults) || 2),
    children: Math.max(0, Number(trip?.children) || 0),
    hotelId: hotelId || null,
    history: compactConversation(messages),
  });

  const answer = stringOrNull(response?.answer ?? response?.result);
  if (!answer) return null;

  const { cleanAnswer, roomCardNames } = extractRoomCardMarkers(
    answer,
    facts?.roomTypes ?? [],
  );

  if (!cleanAnswer) return null;
  if (looksLikeInvalidAgentAnswer(cleanAnswer, question, facts)) return null;

  return {
    answer: cleanAnswer,
    relevantRoomNames: roomNamesMentioned(cleanAnswer, facts?.roomTypes ?? []),
    roomCardNames,
    suggestedPrompts: Array.isArray(response?.suggestedPrompts)
      ? response.suggestedPrompts.slice(0, 3)
      : [],
  };
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function semanticSignals(question) {
  const q = normalize(question);

  return {
    q,
    family: includesAny(q, [
      "gia dinh",
      "ca nha",
      "nha toi",
      "vo con",
      "chong con",
      "con nho",
      "tre em",
      "em be",
      "di cung be",
      "di voi be",
    ]),
    recommendation: includesAny(q, [
      "nen chon",
      "nen dat",
      "chon cai nao",
      "chon phong nao",
      "phong nao hop",
      "cai nao hop",
      "cai nao tot",
      "cai nao hon",
      "dang tien",
      "phu hop hon",
    ]),
    listOrCount:
      q.includes("loai phong") &&
      includesAny(q, ["may", "bao nhieu", "nhung", "co gi", "gom"]),
    price: includesAny(q, [
      "gia",
      "bao tien",
      "bao nhieu tien",
      "het bao nhieu",
      "tien phong",
    ]),
    cheap: includesAny(q, ["re nhat", "it tien", "tiet kiem", "kinh te"]),
    large: includesAny(q, ["rong nhat", "phong rong", "phong to", "dien tich"]),
    availability: includesAny(q, ["con phong", "phong trong", "con cho", "het phong"]),
    viewRoom: includesAny(q, [
      "cho toi xem",
      "toi muon xem",
      "xem phong",
      "xem loai phong",
      "coi phong",
      "mo phong",
      "hien phong",
      "hinh phong",
      "anh phong",
      "xem hinh",
      "xem anh",
    ]),
    compare: includesAny(q, [
      "giua 2 phong",
      "giua hai phong",
      "2 phong do",
      "hai phong do",
      "so sanh",
      "cai nao hon",
      "nen dat phong nao",
      "nen chon phong nao",
    ]),
  };
}

function familyCandidates(roomTypes, trip) {
  const requestedAdults = Math.max(1, Number(trip?.adults) || 2);
  const requestedChildren = Math.max(0, Number(trip?.children) || 0);

  return [...roomTypes]
    .filter((room) => {
      const adultsOk = Number(room.maxAdults ?? 0) >= requestedAdults;
      const children = Number(room.maxChildren ?? 0);
      const childrenOk = requestedChildren > 0
        ? children >= requestedChildren
        : children > 0;
      return adultsOk && childrenOk;
    })
    .sort((left, right) => {
      const leftScore =
        Number(left.maxChildren ?? 0) * 100 +
        Number(left.bedCount ?? 0) * 20 +
        Number(left.areaSqm ?? 0);
      const rightScore =
        Number(right.maxChildren ?? 0) * 100 +
        Number(right.bedCount ?? 0) * 20 +
        Number(right.areaSqm ?? 0);
      return rightScore - leftScore;
    });
}

function describeRoom(room, { includePrice = false } = {}) {
  const details = [];

  if (room.maxAdults > 0) details.push(`${room.maxAdults} người lớn`);
  if (room.maxChildren > 0) details.push(`${room.maxChildren} trẻ em`);
  if (room.bedCount > 0 || room.bedType) {
    details.push(
      `${room.bedCount > 0 ? room.bedCount : ""} ${room.bedType ?? "giường"}`.trim(),
    );
  }
  if (room.areaSqm > 0) details.push(`${room.areaSqm} m²`);

  if (includePrice) {
    const price = room.finalPayableAmount ?? room.totalStayAmount ?? room.basePrice;
    if (price != null) details.push(money(price));
  }

  if (room.availabilityChecked) {
    details.push(`còn ${Math.max(0, Number(room.availableRooms) || 0)} phòng`);
  }

  return `• ${room.name}${details.length ? ` — ${details.join(" · ")}` : ""}`;
}

function selectRoomByName(roomTypes, names) {
  const wanted = new Set((names ?? []).map(normalize));
  return roomTypes.filter((room) => wanted.has(normalize(room.name)));
}

function recommendBetweenRooms(rooms, trip) {
  if (!rooms.length) return null;
  if (rooms.length === 1) {
    return {
      answer: `${rooms[0].name} là lựa chọn đang được nói tới. ${describeRoom(
        rooms[0],
        { includePrice: true },
      ).replace(/^•\s*/, "")}.`,
      roomNames: [rooms[0].name],
    };
  }

  const candidates = [...rooms];
  const requestedChildren = Math.max(0, Number(trip?.children) || 0);

  const score = (room) => {
    let value = 0;
    if (requestedChildren > 0) {
      value += Number(room.maxChildren ?? 0) >= requestedChildren ? 200 : -500;
    }
    value += Number(room.areaSqm ?? 0) * 2;
    value += Number(room.bedCount ?? 0) * 15;
    value += Number(room.availableRooms ?? 0) * 3;

    const price = Number(
      room.finalPayableAmount ?? room.totalStayAmount ?? room.basePrice,
    );
    if (Number.isFinite(price) && price > 0) {
      value -= Math.log10(price + 1) * 4;
    }
    return value;
  };

  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];

  const cheapest = [...rooms]
    .filter((room) =>
      Number.isFinite(
        Number(room.finalPayableAmount ?? room.totalStayAmount ?? room.basePrice),
      ),
    )
    .sort(
      (a, b) =>
        Number(a.finalPayableAmount ?? a.totalStayAmount ?? a.basePrice) -
        Number(b.finalPayableAmount ?? b.totalStayAmount ?? b.basePrice),
    )[0];

  const widest = [...rooms].sort(
    (a, b) => Number(b.areaSqm ?? 0) - Number(a.areaSqm ?? 0),
  )[0];

  const notes = [];
  if (cheapest?.name && cheapest.name !== widest?.name) {
    notes.push(`muốn tiết kiệm thì nghiêng về ${cheapest.name}`);
  }
  if (widest?.name) {
    notes.push(`muốn rộng rãi hơn thì ${widest.name} có ${widest.areaSqm} m²`);
  }

  return {
    answer:
      `Giữa ${rooms.map((room) => room.name).join(" và ")}, mình nghiêng về ${best.name}. ` +
      rooms.map((room) => describeRoom(room, { includePrice: true })).join("\n") +
      (notes.length ? `\n${notes.join("; ")}.` : ""),
    roomNames: rooms.map((room) => room.name),
  };
}

function roomCardFromFact(room, facts) {
  return {
    id: room.id,
    hotelId: facts?.hotel?.id ?? null,
    hotelName: facts?.hotel?.name ?? null,
    name: room.name,
    description: room.description ?? null,
    imageUrls: Array.isArray(room.imageUrls) ? room.imageUrls : [],
    basePrice: room.basePrice ?? null,
    totalStayAmount: room.totalStayAmount ?? null,
    finalPayableAmount: room.finalPayableAmount ?? null,
    totalDiscount: room.totalDiscount ?? 0,
    maxAdults: room.maxAdults ?? 0,
    maxChildren: room.maxChildren ?? 0,
    bedType: room.bedType ?? null,
    bedCount: room.bedCount ?? 0,
    areaSqm: room.areaSqm ?? 0,
    availableRooms: room.availableRooms ?? null,
    availabilityChecked: Boolean(room.availabilityChecked),
    amenities: Array.isArray(room.amenities) ? room.amenities : [],
    checkIn: facts?.trip?.checkIn ?? null,
    checkOut: facts?.trip?.checkOut ?? null,
    adults: facts?.trip?.adults ?? 2,
    children: facts?.trip?.children ?? 0,
  };
}

function selectRoomCards(roomNames, facts) {
  if (!Array.isArray(roomNames) || !roomNames.length) return [];
  const wanted = new Set(roomNames.map(normalize));

  return (facts?.roomTypes ?? [])
    .filter((room) => wanted.has(normalize(room.name)))
    .map((room) => roomCardFromFact(room, facts));
}

function buildSmartFallback({ question, facts, state, messages }) {
  const roomTypes = facts?.roomTypes ?? [];
  const hotelName = facts?.hotel?.name ?? state?.name ?? "Khách sạn này";
  const signals = semanticSignals(question);
  const previousRoomCandidates = getPreviousRoomCandidates(
    state,
    facts,
    messages,
  );

  if (signals.viewRoom) {
    const mentionedNow = roomNamesMentioned(question, roomTypes);
    const roomCardNames = mentionedNow.length
      ? mentionedNow
      : previousRoomCandidates.slice(0, 1);

    if (roomCardNames.length) {
      const selected = selectRoomByName(roomTypes, roomCardNames);
      const room = selected[0];

      if (room) {
        return {
          answer:
            `${room.name} tại ${hotelName}: ` +
            describeRoom(room, { includePrice: true }).replace(/^•\s*/, "") +
            ". Mình hiển thị hình ảnh loại phòng ngay bên dưới.",
          relevantRoomNames: roomCardNames,
          roomCardNames,
          suggestedPrompts: [
            `Phòng ${room.name} còn trống không?`,
            `Giá ${room.name} sau ưu đãi là bao nhiêu?`,
          ],
        };
      }
    }
  }

  if (!roomTypes.length) {
    return {
      answer: `${hotelName} hiện chưa có loại phòng nào đang hoạt động.`,
      relevantRoomNames: [],
      suggestedPrompts: [],
    };
  }

  if (signals.compare && previousRoomCandidates.length >= 2) {
    const focusedRooms = selectRoomByName(roomTypes, previousRoomCandidates);
    const compared = recommendBetweenRooms(focusedRooms, facts?.trip);
    if (compared) {
      return {
        answer: compared.answer,
        relevantRoomNames: compared.roomNames,
        suggestedPrompts: ["Giá 2 phòng đó bao nhiêu?", "Phòng nào rộng hơn?"],
      };
    }
  }

  if (signals.family) {
    const candidates = familyCandidates(roomTypes, facts?.trip);

    if (!candidates.length) {
      return {
        answer: `${hotelName} hiện chưa có loại phòng nào được dữ liệu xác nhận phù hợp cho gia đình có trẻ em.`,
        relevantRoomNames: [],
        suggestedPrompts: [],
      };
    }

    const lines = candidates.map((room) => describeRoom(room));
    const widest = [...candidates].sort(
      (a, b) => Number(b.areaSqm ?? 0) - Number(a.areaSqm ?? 0),
    )[0];
    const mostBeds = [...candidates].sort(
      (a, b) => Number(b.bedCount ?? 0) - Number(a.bedCount ?? 0),
    )[0];

    let recommendation = "";
    if (candidates.length === 1) {
      recommendation = `\nMình ưu tiên ${candidates[0].name} cho nhu cầu này.`;
    } else if (widest?.name && mostBeds?.name) {
      recommendation =
        `\nNếu ưu tiên không gian, chọn ${widest.name}` +
        `${widest.areaSqm > 0 ? ` (${widest.areaSqm} m²)` : ""}; ` +
        `nếu ưu tiên nhiều chỗ ngủ, chọn ${mostBeds.name}` +
        `${mostBeds.bedCount > 0 ? ` (${mostBeds.bedCount} ${mostBeds.bedType ?? "giường"})` : ""}.`;
    }

    return {
      answer:
        `${hotelName} có ${candidates.length} loại phòng phù hợp cho gia đình:\n` +
        lines.join("\n") +
        recommendation,
      relevantRoomNames: candidates.map((room) => room.name),
      suggestedPrompts: [
        "Giữa các phòng đó nên chọn phòng nào?",
        "Giá các phòng đó bao nhiêu?",
      ],
    };
  }

  if (signals.listOrCount) {
    const names = roomTypes.map((room) => room.name).filter(Boolean);
    return {
      answer: `${hotelName} hiện có ${roomTypes.length} loại phòng: ${names.join(
        ", ",
      )}.`,
      relevantRoomNames: names,
      suggestedPrompts: ["Phòng nào hợp gia đình?", "Giá từng loại phòng?"],
    };
  }

  if (signals.price) {
    const focused = previousRoomCandidates.length
      ? selectRoomByName(roomTypes, previousRoomCandidates)
      : roomTypes;

    return {
      answer:
        focused.map((room) => describeRoom(room, { includePrice: true })).join("\n") ||
        "Mình chưa có giá phòng để hiển thị.",
      relevantRoomNames: focused.map((room) => room.name),
      suggestedPrompts: [],
    };
  }

  if (signals.cheap) {
    const priced = [...roomTypes]
      .filter((room) =>
        Number.isFinite(
          Number(room.finalPayableAmount ?? room.totalStayAmount ?? room.basePrice),
        ),
      )
      .sort(
        (a, b) =>
          Number(a.finalPayableAmount ?? a.totalStayAmount ?? a.basePrice) -
          Number(b.finalPayableAmount ?? b.totalStayAmount ?? b.basePrice),
      );

    if (priced.length) {
      const room = priced[0];
      const price = room.finalPayableAmount ?? room.totalStayAmount ?? room.basePrice;
      return {
        answer: `${room.name} đang là lựa chọn rẻ nhất với ${money(price)}${
          room.finalPayableAmount != null || room.totalStayAmount != null
            ? " cho kỳ nghỉ đã chọn"
            : "/đêm"
        }.`,
        relevantRoomNames: [room.name],
        suggestedPrompts: [],
      };
    }
  }

  if (signals.large) {
    const widest = [...roomTypes].sort(
      (a, b) => Number(b.areaSqm ?? 0) - Number(a.areaSqm ?? 0),
    )[0];

    if (widest?.areaSqm > 0) {
      return {
        answer: `${widest.name} là loại phòng rộng nhất, diện tích ${widest.areaSqm} m².`,
        relevantRoomNames: [widest.name],
        suggestedPrompts: [],
      };
    }
  }

  if (signals.availability && facts?.trip?.checkIn && facts?.trip?.checkOut) {
    const available = roomTypes.filter((room) => Number(room.availableRooms ?? 0) > 0);
    return {
      answer: available.length
        ? `Trong ngày đã chọn, ${available
            .map((room) => `${room.name} còn ${room.availableRooms} phòng`)
            .join(", ")}.`
        : "Trong ngày đã chọn hiện chưa thấy loại phòng nào còn trống.",
      relevantRoomNames: available.map((room) => room.name),
      suggestedPrompts: [],
    };
  }

  /*
   * Fallback cuối cùng chỉ dùng khi cả Gemini lẫn semantic fallback
   * không xác định được câu hỏi. KHÔNG tự trả danh sách room type nữa.
   */
  return {
    answer: `Mình đang theo dõi ${hotelName} và vẫn giữ ngày ${
      facts?.trip?.checkIn && facts?.trip?.checkOut
        ? `${facts.trip.checkIn} → ${facts.trip.checkOut}`
        : "bạn đang chọn"
    }. Bạn cứ hỏi tiếp tự nhiên về phòng, giá, sức chứa hoặc ưu đãi.`,
    relevantRoomNames: previousRoomCandidates,
    suggestedPrompts: [],
  };
}

function buildAgentContext({ state, facts, result }) {
  const previous = state.previousAgentContext ?? {};
  const roomFacts = facts?.roomTypes ?? [];

  let roomCandidates = result?.relevantRoomNames ?? [];

  if (!roomCandidates.length && result?.answer) {
    roomCandidates = roomNamesMentioned(result.answer, roomFacts);
  }

  if (!roomCandidates.length) {
    roomCandidates = Array.isArray(previous.roomCandidates)
      ? previous.roomCandidates
      : [];
  }

  return {
    currentHotelId: state.id,
    currentHotelName: facts?.hotel?.name ?? state.name,
    roomCandidates: [...new Set(roomCandidates)].slice(0, 6),
    preferences: Array.isArray(previous.preferences) ? previous.preferences : [],
    entities: {
      ...(previous.entities ?? {}),
      adults: facts?.trip?.adults ?? previous?.entities?.adults ?? null,
      children: facts?.trip?.children ?? previous?.entities?.children ?? null,
      checkIn: facts?.trip?.checkIn ?? previous?.entities?.checkIn ?? null,
      checkOut: facts?.trip?.checkOut ?? previous?.entities?.checkOut ?? null,
    },
    lastGoal: result?.answer
      ? String(result.answer).slice(0, 220)
      : previous.lastGoal,
  };
}

export async function runBookingAgent({
  question,
  messages,
  trip,
  contextualHotel,
}) {
  const rawQuestion = String(question ?? "").trim();
  if (!rawQuestion) return null;

  const state = currentHotelState(messages, contextualHotel);
  if (!state.id) return null;

  const activeTrip = compactTrip(trip);

  let facts;
  try {
    facts = await loadHotelContext(state, activeTrip);
  } catch {
    facts = null;
  }

  if (!facts) return null;

  const previousRoomCandidates = getPreviousRoomCandidates(
    state,
    facts,
    messages,
  );

  let result = await (async () => {
    try {
      return await askGroundedSemanticAgent({
        question: rawQuestion,
        messages,
        state,
        facts,
        trip: activeTrip,
        hotelId: state.id,
        previousRoomCandidates,
      });
    } catch {
      return null;
    }
  })();

  /*
   * Gemini / AI endpoint lỗi hoặc trả lời lệch ngữ cảnh:
   * dùng fallback hiểu theo khái niệm + facts thật.
   * Quan trọng: không còn fallback cũ "có 3 loại phòng..." cho mọi câu.
   */
  if (!result) {
    result = buildSmartFallback({
      question: rawQuestion,
      facts,
      state,
      messages,
    });
  }

  const roomCards = selectRoomCards(result.roomCardNames ?? [], facts);

  return {
    answer: result.answer,
    hotels: [],
    bookings: [],
    intent: "BOOKING_AGENT_SEMANTIC",
    suggestedPrompts: result.suggestedPrompts ?? [],
    copilot: roomCards.length
      ? {
          roomCards,
        }
      : null,
    agentContext: buildAgentContext({
      state,
      facts,
      result,
    }),
  };
}
