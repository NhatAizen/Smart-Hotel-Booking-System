import apiClient from "../api/apiClient";
import { askEnziuAssistant } from "../services/aiService";

export const SEMANTIC_INTENTS = Object.freeze({
  HOTEL_SEARCH: "HOTEL_SEARCH",
  HOTEL_COUNT: "HOTEL_COUNT",
  HOTEL_RESULT_COUNT: "HOTEL_RESULT_COUNT",
  HOTEL_OTHER_OPTIONS: "HOTEL_OTHER_OPTIONS",

  ROOM_TYPE_LIST: "ROOM_TYPE_LIST",
  ROOM_TYPE_PRICES: "ROOM_TYPE_PRICES",
  ROOM_FAMILY_RECOMMENDATION: "ROOM_FAMILY_RECOMMENDATION",
  ROOM_CAPACITY_RECOMMENDATION: "ROOM_CAPACITY_RECOMMENDATION",
  ROOM_CHEAPEST: "ROOM_CHEAPEST",
  ROOM_LARGEST: "ROOM_LARGEST",

  PRICE_EXPLANATION: "PRICE_EXPLANATION",
  BUDGET_CHECK: "BUDGET_CHECK",
  PROMOTION_LIST: "PROMOTION_LIST",
  PRICE_WITHOUT_PROMOTION: "PRICE_WITHOUT_PROMOTION",

  AVAILABILITY_CHECK: "AVAILABILITY_CHECK",
  BOOKING_LOOKUP: "BOOKING_LOOKUP",
  GENERAL_QA: "GENERAL_QA",
  UNKNOWN: "UNKNOWN",
});

const VALID_INTENTS = new Set(Object.values(SEMANTIC_INTENTS));

async function callSemanticModel(prompt, context) {
  try {
    // /ai/chat là endpoint text thuần: phù hợp cho classification hơn
    // /ai/assistant vì không cần chạy hotel/booking tools.
    const response = await apiClient.post("/ai/chat", {
      message: prompt,
    });

    return (
      response?.data?.result ??
      response?.data?.answer ??
      response?.data
    );
  } catch {
    // Nếu deployment hiện tại không expose /ai/chat,
    // fallback về assistant hiện có.
    const response = await askEnziuAssistant({
      message: prompt,
      userMessage: context.question,

      checkIn:
        context.trip?.checkIn ||
        null,

      checkOut:
        context.trip?.checkOut ||
        null,

      adults:
        Number(
          context.trip?.adults,
        ) || 1,

      children:
        Number(
          context.trip?.children,
        ) || 0,

      hotelId:
        context.contextualHotel?.id ||
        null,

      history: [],
    });

    return (
      response?.answer ??
      response?.result ??
      response
    );
  }
}

function numberOrNull(value) {
  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function stringOrNull(value) {
  const text = String(
    value ?? "",
  ).trim();

  return text || null;
}

function latestAssistantWithHotels(
  messages,
) {
  return [...(messages ?? [])]
    .reverse()
    .find(
      (item) =>
        item?.role ===
          "assistant" &&
        Array.isArray(
          item?.hotels,
        ) &&
        item.hotels.length > 0,
    );
}

function latestUserMessage(
  messages,
) {
  return [...(messages ?? [])]
    .reverse()
    .find(
      (item) =>
        item?.role === "user" &&
        String(
          item?.content ?? "",
        ).trim(),
    );
}

function compactHotelContext(
  messages,
  contextualHotel,
) {
  const latest =
    latestAssistantWithHotels(
      messages,
    );

  const hotel =
    latest?.hotels?.[0] ??
    null;

  const name =
    contextualHotel?.name ??
    hotel?.name ??
    null;

  const hotelId =
    contextualHotel?.id ??
    hotel?.hotelId ??
    hotel?.id ??
    null;

  if (
    !name &&
    !hotelId
  ) {
    return "không có khách sạn hiện tại";
  }

  const facts = [
    name
      ? `tên=${name}`
      : null,

    hotelId
      ? `id=${hotelId}`
      : null,

    hotel?.roomTypeName
      ? `room gần nhất=${hotel.roomTypeName}`
      : null,

    hotel?.pricePerNight != null
      ? `giá niêm yết=${hotel.pricePerNight}`
      : null,

    hotel?.finalPayableAmount !=
    null
      ? `giá cuối=${hotel.finalPayableAmount}`
      : null,

    hotel?.availableRooms !=
    null
      ? `phòng trống=${hotel.availableRooms}`
      : null,
  ].filter(Boolean);

  return facts.join("; ");
}

function compactTrip(trip) {
  return [
    trip?.checkIn
      ? `checkIn=${trip.checkIn}`
      : null,

    trip?.checkOut
      ? `checkOut=${trip.checkOut}`
      : null,

    `adults=${Math.max(
      1,
      Number(
        trip?.adults,
      ) || 2,
    )}`,

    `children=${Math.max(
      0,
      Number(
        trip?.children,
      ) || 0,
    )}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function buildRouterPrompt({
  question,
  messages,
  trip,
  contextualHotel,
}) {
  const lastUser =
    latestUserMessage(
      messages,
    )?.content ?? "";

  const hotelContext =
    compactHotelContext(
      messages,
      contextualHotel,
    );

  const tripContext =
    compactTrip(trip);

  return `Bạn là bộ định tuyến ý định NGỮ NGHĨA của EnziuRooms.

Nhiệm vụ duy nhất:
Hiểu Ý NGHĨA câu hiện tại, kể cả:
- viết sai chính tả
- nói rút gọn
- dùng từ đồng nghĩa
- dùng đại từ như "cái đó", "phòng ấy", "nhà tôi"
- nói chuyện theo ngữ cảnh câu trước

KHÔNG trả lời câu hỏi.
KHÔNG tìm khách sạn.
KHÔNG giải thích.
Chỉ trả về đúng 1 JSON object.
Không markdown.

Các intent hợp lệ:

HOTEL_SEARCH
- tìm/gợi ý khách sạn
- khách sạn hot
- khách sạn tốt
- khách sạn rẻ
- khách sạn phù hợp

HOTEL_COUNT
- hỏi toàn hệ thống có bao nhiêu khách sạn

HOTEL_RESULT_COUNT
- hỏi tại sao kết quả vừa rồi chỉ có một/mấy lựa chọn
- "chỉ có vậy thôi à"
- "có mỗi một cái à"

HOTEL_OTHER_OPTIONS
- muốn xem khách sạn khác
- lựa chọn khác

ROOM_TYPE_LIST
- hỏi khách sạn hiện tại có những loại phòng nào
- có mấy loại phòng

ROOM_TYPE_PRICES
- hỏi giá một hoặc nhiều loại phòng
- "3 phòng kia bao tiền"
- "mỗi loại giá sao"

ROOM_FAMILY_RECOMMENDATION
- hỏi phòng phù hợp cho gia đình
- vợ/chồng
- con nhỏ
- trẻ em
- đi cùng bé

ROOM_CAPACITY_RECOMMENDATION
- hỏi phòng phù hợp số người cụ thể
- nhóm người
- đi đông

ROOM_CHEAPEST
- hỏi loại phòng rẻ nhất
- tiết kiệm nhất

ROOM_LARGEST
- hỏi loại phòng rộng nhất
- to nhất

PRICE_EXPLANATION
- hỏi vì sao giá tăng
- vì sao giá giảm
- giá chênh
- 10k thành 11k

BUDGET_CHECK
- hỏi với số tiền này có thuê/đặt được không
- ngân sách có đủ không

PROMOTION_LIST
- hỏi đang có mã nào
- voucher nào
- ưu đãi nào

PRICE_WITHOUT_PROMOTION
- hỏi bỏ mã thì giá bao nhiêu
- không dùng voucher thì sao

AVAILABILITY_CHECK
- hỏi còn phòng không
- phòng trống không
- còn chỗ không

BOOKING_LOOKUP
- hỏi booking/đơn đã đặt của chính người dùng

GENERAL_QA
- câu hỏi chung không thuộc các nghiệp vụ trên

UNKNOWN
- không đủ ngữ cảnh để hiểu

Quy tắc cực kỳ quan trọng:

1. Phân loại theo NGHĨA, KHÔNG theo đúng câu mẫu.

2. Các câu:
"phòng nào dành cho gia đình"
"phòng giành cho gia đình ấy"
"nhà tôi có con nhỏ thì ở loại nào"
"đi cùng vợ con chọn gì"
"có phòng nào hợp nhà tôi không"
đều là:
ROOM_FAMILY_RECOMMENDATION

3. Các câu:
"3 phòng kia bao tiền"
"mỗi loại giá sao"
"giá mấy phòng đó"
"cho xem giá mấy loại kia"
đều là:
ROOM_TYPE_PRICES

4. Các câu:
"tôi có 8k thì sao"
"từng này tiền đủ ở không"
"8 nghìn thuê được chứ"
là:
BUDGET_CHECK
nếu đang nói về hotel/phòng.

5. Các câu:
"sao hôm đó mắc hơn"
"10k sao thành 11k"
"ủa sao tự nhiên tăng tiền"
là:
PRICE_EXPLANATION

6. Nếu câu dùng:
"cái đó"
"khách sạn đó"
"phòng kia"
"loại ấy"
hãy dựa vào ngữ cảnh gần nhất.

7. Chỉ trích xuất entity nếu người dùng thực sự nói hoặc ngữ cảnh đã rõ.

Ngữ cảnh hiện tại:

Khách sạn:
${hotelContext}

Chuyến đi:
${tripContext}

Tin người dùng trước:
${lastUser || "không có"}

Câu hiện tại:
${String(
  question ?? "",
).trim()}

JSON schema bắt buộc:

{
  "intent": "...",
  "confidence": 0.0,
  "entities": {
    "budget": null,
    "adults": null,
    "children": null,
    "roomTypeName": null,
    "hotelReference": "CURRENT_HOTEL|NONE",
    "location": null
  },
  "needsClarification": false,
  "clarificationQuestion": null
}`;
}

function extractJsonObject(text) {
  const raw = String(
    text ?? "",
  ).trim();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  const fenced =
    raw.match(
      /```(?:json)?\s*([\s\S]*?)```/i,
    );

  if (fenced?.[1]) {
    try {
      return JSON.parse(
        fenced[1].trim(),
      );
    } catch {
      // continue
    }
  }

  const first =
    raw.indexOf("{");

  const last =
    raw.lastIndexOf("}");

  if (
    first >= 0 &&
    last > first
  ) {
    try {
      return JSON.parse(
        raw.slice(
          first,
          last + 1,
        ),
      );
    } catch {
      return null;
    }
  }

  return null;
}

function sanitizeRouterResult(
  value,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const intent = String(
    value.intent ?? "",
  )
    .trim()
    .toUpperCase();

  if (
    !VALID_INTENTS.has(
      intent,
    )
  ) {
    return null;
  }

  const confidenceRaw =
    numberOrNull(
      value.confidence,
    );

  const confidence =
    Math.max(
      0,
      Math.min(
        1,
        confidenceRaw ?? 0,
      ),
    );

  const entities =
    value.entities &&
    typeof value.entities ===
      "object"
      ? value.entities
      : {};

  return {
    intent,

    confidence,

    entities: {
      budget:
        numberOrNull(
          entities.budget,
        ),

      adults:
        numberOrNull(
          entities.adults,
        ),

      children:
        numberOrNull(
          entities.children,
        ),

      roomTypeName:
        stringOrNull(
          entities.roomTypeName,
        ),

      hotelReference:
        String(
          entities.hotelReference ??
            "NONE",
        ).toUpperCase() ===
        "CURRENT_HOTEL"
          ? "CURRENT_HOTEL"
          : "NONE",

      location:
        stringOrNull(
          entities.location,
        ),
    },

    needsClarification:
      Boolean(
        value.needsClarification,
      ),

    clarificationQuestion:
      stringOrNull(
        value.clarificationQuestion,
      ),

    source:
      "semantic-router",
  };
}

export async function routeSemanticIntent({
  question,
  messages,
  trip,
  contextualHotel,
}) {
  const raw = String(
    question ?? "",
  ).trim();

  if (!raw) {
    return null;
  }

  try {
    const prompt =
      buildRouterPrompt({
        question: raw,
        messages,
        trip,
        contextualHotel,
      });

    const rawResponse =
      await callSemanticModel(
        prompt,
        {
          question: raw,
          trip,
          contextualHotel,
        },
      );

    const candidate =
      rawResponse?.semanticIntent ??
      rawResponse?.router ??
      extractJsonObject(
        rawResponse?.answer ??
          rawResponse?.result ??
          rawResponse,
      );

    const sanitized =
      sanitizeRouterResult(
        candidate,
      );

    if (!sanitized) {
      return null;
    }

    if (
      sanitized.confidence <
      0.55
    ) {
      return {
        ...sanitized,
        lowConfidence: true,
      };
    }

    return sanitized;
  } catch {
    // Nếu semantic router lỗi:
    // flow cũ vẫn tiếp tục.
    return null;
  }
}

/*
 * Chuyển semantic intent
 * thành câu nghiệp vụ chuẩn
 * mà business handler hiện tại hiểu.
 *
 * Người dùng KHÔNG cần nói đúng câu này.
 * Đây chỉ là internal bridge.
 */
export function toBusinessQuestion(
  question,
  semanticIntent,
) {
  const raw = String(
    question ?? "",
  ).trim();

  const intent = String(
    semanticIntent?.intent ??
      "",
  ).toUpperCase();

  const budget = Number(
    semanticIntent
      ?.entities
      ?.budget,
  );

  switch (intent) {
    case SEMANTIC_INTENTS
      .ROOM_FAMILY_RECOMMENDATION:
      return "phòng nào dành cho gia đình";

    case SEMANTIC_INTENTS
      .ROOM_TYPE_LIST:
      return "khách sạn này có mấy loại phòng";

    case SEMANTIC_INTENTS
      .ROOM_TYPE_PRICES:
      return "giá các loại phòng";

    case SEMANTIC_INTENTS
      .ROOM_CHEAPEST:
      return "phòng nào rẻ nhất";

    case SEMANTIC_INTENTS
      .ROOM_LARGEST:
      return "phòng nào rộng nhất";

    case SEMANTIC_INTENTS
      .HOTEL_COUNT:
      return "có mấy khách sạn";

    case SEMANTIC_INTENTS
      .HOTEL_RESULT_COUNT:
      return "chỉ có 1 cái thôi à";

    case SEMANTIC_INTENTS
      .HOTEL_OTHER_OPTIONS:
      return "còn khách sạn nào khác không";

    case SEMANTIC_INTENTS
      .PRICE_EXPLANATION:
      return "tại sao giá tăng";

    case SEMANTIC_INTENTS
      .BUDGET_CHECK:
      return (
        Number.isFinite(
          budget,
        ) &&
        budget > 0
      )
        ? `tôi có ${Math.round(
            budget,
          )} đồng thì có đủ không`
        : raw;

    case SEMANTIC_INTENTS
      .PROMOTION_LIST:
      return "mã nào đang dùng";

    case SEMANTIC_INTENTS
      .PRICE_WITHOUT_PROMOTION:
      return "không dùng mã giảm giá thì sao";

    default:
      return raw;
  }
}

/*
 * Nếu Gemini hiểu:
 * "nhà tôi 2 người lớn 1 bé"
 *
 * thì chỉ dùng 2/1 cho câu hỏi hiện tại.
 *
 * Không ghi đè trip lưu lâu dài
 * nếu user chưa sửa form trip.
 */
export function applySemanticEntitiesToTrip(
  trip,
  semanticIntent,
) {
  const base = {
    checkIn:
      String(
        trip?.checkIn ?? "",
      ),

    checkOut:
      String(
        trip?.checkOut ?? "",
      ),

    adults:
      Math.max(
        1,
        Number(
          trip?.adults,
        ) || 2,
      ),

    children:
      Math.max(
        0,
        Number(
          trip?.children,
        ) || 0,
      ),
  };

  const adults =
    Number(
      semanticIntent
        ?.entities
        ?.adults,
    );

  const children =
    Number(
      semanticIntent
        ?.entities
        ?.children,
    );

  return {
    ...base,

    adults:
      Number.isFinite(
        adults,
      ) &&
      adults > 0
        ? Math.floor(adults)
        : base.adults,

    children:
      Number.isFinite(
        children,
      ) &&
      children >= 0
        ? Math.floor(children)
        : base.children,
  };
}