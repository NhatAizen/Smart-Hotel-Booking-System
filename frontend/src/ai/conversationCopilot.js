import { previewDiscount } from "../services/promotionService";
import {
  getHotels,
  getRoomTypesByHotel,
} from "../services/hotelService";

/* =========================================================
 * TEXT HELPERS
 * ========================================================= */

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

function money(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${Math.round(numeric).toLocaleString("vi-VN")} ₫`;
}

function joinVietnameseList(values) {
  const items = (values ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} và ${items[1]}`;

  return `${items.slice(0, -1).join(", ")} và ${items.at(-1)}`;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

/* =========================================================
 * MESSAGE HISTORY
 * ========================================================= */

function latestAssistantWithHotels(messages) {
  return [...(messages ?? [])]
    .reverse()
    .find(
      (item) =>
        item?.role === "assistant" &&
        Array.isArray(item?.hotels) &&
        item.hotels.length > 0,
    );
}

function latestUserSearch(messages) {
  return [...(messages ?? [])]
    .reverse()
    .find(
      (item) =>
        item?.role === "user" &&
        String(item?.content ?? "").trim(),
    );
}

function hotelFacts(hotel) {
  if (!hotel) return "";

  const codes = [
    hotel.hotelPromotionCode,
    hotel.platformPromotionCode,
  ]
    .filter(Boolean)
    .join(" + ");

  return [
    `hotel=${hotel.name ?? "khách sạn"}`,
    hotel.hotelId ? `hotelId=${hotel.hotelId}` : null,
    hotel.locationLabel ? `địa_chỉ=${hotel.locationLabel}` : null,
    hotel.roomTypeName ? `loại_phòng=${hotel.roomTypeName}` : null,
    hotel.pricePerNight != null
      ? `giá_niêm_yết_đêm=${money(hotel.pricePerNight)}`
      : null,
    hotel.totalStayAmount != null
      ? `tổng_trước_ưu_đãi=${money(hotel.totalStayAmount)}`
      : null,
    hotel.finalPayableAmount != null
      ? `giá_sau_ưu_đãi=${money(hotel.finalPayableAmount)}`
      : null,
    hotel.availableRooms != null
      ? `phòng_trống=${hotel.availableRooms}`
      : null,
    hotel.averageRating != null
      ? `review=${hotel.averageRating}`
      : null,
    codes ? `mã_đang_dùng=${codes}` : "mã_đang_dùng=không",
  ]
    .filter(Boolean)
    .join("; ");
}

function bookingFacts(booking) {
  if (!booking) return "";

  return [
    booking.bookingCode ? `mã=${booking.bookingCode}` : null,
    booking.hotelName ? `hotel=${booking.hotelName}` : null,
    booking.totalPrice != null ? `tổng=${money(booking.totalPrice)}` : null,
    booking.remainingAmount != null
      ? `còn_lại=${money(booking.remainingAmount)}`
      : null,
    booking.bookingStatus
      ? `trạng_thái=${booking.bookingStatus}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildGroundedHistory(messages) {
  return (messages ?? []).slice(-8).map((item) => {
    let content = String(item?.content ?? "").trim();

    if (item?.role === "assistant") {
      const hotelData = Array.isArray(item?.hotels)
        ? item.hotels.slice(0, 3).map(hotelFacts).filter(Boolean)
        : [];

      const bookingData = Array.isArray(item?.bookings)
        ? item.bookings.slice(0, 3).map(bookingFacts).filter(Boolean)
        : [];

      const facts = [
        hotelData.length ? `HOTEL_FACTS: ${hotelData.join(" || ")}` : null,
        bookingData.length
          ? `BOOKING_FACTS: ${bookingData.join(" || ")}`
          : null,
      ].filter(Boolean);

      if (facts.length) {
        content = `${content}\n${facts.join("\n")}`;
      }
    }

    return {
      role: item?.role === "user" ? "user" : "assistant",
      content,
    };
  });
}

/* =========================================================
 * HOTEL / ROOM TYPE DATA HELPERS
 * ========================================================= */

function isPublicHotel(hotel) {
  if (!hotel || hotel.deleted === true || hotel.active === false) {
    return false;
  }

  const status = String(hotel.status ?? "").trim().toUpperCase();
  const approval = String(hotel.approvalStatus ?? "").trim().toUpperCase();

  if (
    status &&
    ["INACTIVE", "REJECTED", "PENDING", "DELETED"].includes(status)
  ) {
    return false;
  }

  if (approval && approval !== "APPROVED") {
    return false;
  }

  return true;
}

function isPublicRoomType(roomType) {
  if (!roomType || roomType.deleted === true || roomType.active === false) {
    return false;
  }

  const status = String(roomType.status ?? "").trim().toUpperCase();
  const approval = String(roomType.approvalStatus ?? "")
    .trim()
    .toUpperCase();

  if (
    status &&
    ["INACTIVE", "REJECTED", "PENDING", "DELETED"].includes(status)
  ) {
    return false;
  }

  if (approval && approval !== "APPROVED") {
    return false;
  }

  return true;
}

async function getPublicHotelCatalog() {
  const raw = await getHotels();
  return listOf(raw).filter(isPublicHotel);
}

function getCurrentHotel(messages) {
  const latest = latestAssistantWithHotels(messages);
  return latest?.hotels?.[0] ?? null;
}

async function getCurrentHotelRoomTypes(messages) {
  const hotel = getCurrentHotel(messages);
  const hotelId = hotel?.hotelId ?? hotel?.id ?? null;

  if (!hotelId) {
    return {
      hotel: null,
      roomTypes: [],
    };
  }

  const raw = await getRoomTypesByHotel(hotelId);

  return {
    hotel,
    roomTypes: listOf(raw).filter(isPublicRoomType),
  };
}

function getRoomTypePrice(roomType) {
  const candidates = [
    roomType?.basePrice,
    roomType?.pricePerNight,
    roomType?.price,
    roomType?.nightlyPrice,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);

    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }

  return null;
}

function roomTypeCapacityText(roomType) {
  const adults = Math.max(0, Number(roomType?.maxAdults ?? 0));
  const children = Math.max(0, Number(roomType?.maxChildren ?? 0));

  const parts = [];

  if (adults > 0) {
    parts.push(`${adults} người lớn`);
  }

  if (children > 0) {
    parts.push(`${children} trẻ em`);
  }

  return parts.join(" + ");
}

function roomTypeBedText(roomType) {
  const bedCount = Math.max(0, Number(roomType?.bedCount ?? 0));
  const bedType = String(roomType?.bedType ?? "").trim();

  if (bedCount > 0 && bedType) {
    return `${bedCount} ${bedType}`;
  }

  if (bedCount > 0) {
    return `${bedCount} giường`;
  }

  if (bedType) {
    return bedType;
  }

  return "";
}

/* =========================================================
 * FAMILY ROOM INTENT
 * ========================================================= */

function asksFamilyRoom(question) {
  const q = normalize(question);

  if (!q) return false;

  const patterns = [
    "phong nao danh cho gia dinh",
    "phong nao cho gia dinh",
    "phong gia dinh",
    "phong nao hop gia dinh",
    "loai phong nao cho gia dinh",
    "loai phong nao hop gia dinh",

    "phong nao co tre em",
    "phong nao cho tre em",
    "di voi tre em chon phong nao",

    "di gia dinh chon phong nao",
    "gia dinh nen chon phong nao",

    "phong nao hop voi nha toi",
  ];

  return patterns.some((pattern) =>
    q.includes(pattern),
  );
}

function familyRoomScore(roomType) {
  const maxChildren =
    Math.max(
      0,
      Number(roomType?.maxChildren ?? 0),
    );

  const maxAdults =
    Math.max(
      0,
      Number(roomType?.maxAdults ?? 0),
    );

  const bedCount =
    Math.max(
      0,
      Number(roomType?.bedCount ?? 0),
    );

  const areaSqm =
    Math.max(
      0,
      Number(roomType?.areaSqm ?? 0),
    );

  return (
    maxChildren * 100 +
    Math.min(bedCount, 4) * 20 +
    Math.min(maxAdults, 6) * 5 +
    Math.min(areaSqm, 100) / 10
  );
}

async function resolveFamilyRoom(
  question,
  messages,
  trip,
) {
  if (!asksFamilyRoom(question)) {
    return null;
  }

  try {
    const {
      hotel,
      roomTypes,
    } =
      await getCurrentHotelRoomTypes(
        messages,
      );

    if (!hotel) {
      return {
        answer:
          "Bạn đang hỏi khách sạn nào? Hãy nhắc tên hoặc chọn khách sạn để mình kiểm tra các loại phòng phù hợp cho gia đình.",

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    if (!roomTypes.length) {
      return {
        answer:
          `${hotel.name ?? "Khách sạn này"} hiện chưa có loại phòng nào đang hoạt động.`,

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    const requestedAdults =
      Math.max(
        1,
        Number(trip?.adults ?? 2),
      );

    const requestedChildren =
      Math.max(
        0,
        Number(trip?.children ?? 0),
      );

    let familyCandidates;

    if (requestedChildren > 0) {
      familyCandidates =
        roomTypes.filter(
          (roomType) =>
            Number(
              roomType?.maxAdults ?? 0,
            ) >= requestedAdults &&
            Number(
              roomType?.maxChildren ?? 0,
            ) >= requestedChildren,
        );
    } else {
      /*
       * User chỉ nói "gia đình"
       * nhưng chưa khai số trẻ em.
       *
       * Chỉ xem các room type
       * cho phép trẻ em hoặc có nhiều giường.
       */
      familyCandidates =
        roomTypes.filter(
          (roomType) =>
            Number(
              roomType?.maxChildren ?? 0,
            ) > 0 ||
            Number(
              roomType?.bedCount ?? 0,
            ) >= 2,
        );
    }

    familyCandidates =
      familyCandidates.sort(
        (left, right) =>
          familyRoomScore(right) -
          familyRoomScore(left),
      );

    if (!familyCandidates.length) {
      if (requestedChildren > 0) {
        return {
          answer:
            `${hotel.name ?? "Khách sạn này"} chưa có loại phòng nào đủ sức chứa ` +
            `${requestedAdults} người lớn và ${requestedChildren} trẻ em theo dữ liệu hiện tại.`,

          hotels: [],
          bookings: [],

          suggestedPrompts: [
            "Có thể đặt 2 phòng không?",
            "Cho tôi xem sức chứa từng loại phòng",
          ],

          presentation: {
            textOnly: true,
          },
        };
      }

      return {
        answer:
          `${hotel.name ?? "Khách sạn này"} chưa có loại phòng nào được dữ liệu hiện tại xác nhận phù hợp rõ cho gia đình có trẻ em.`,

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    const lines =
      familyCandidates.map(
        (roomType) => {
          const name =
            String(
              roomType?.name ??
                "Loại phòng",
            ).trim();

          const capacity =
            roomTypeCapacityText(
              roomType,
            );

          const bed =
            roomTypeBedText(
              roomType,
            );

          const area =
            Number(
              roomType?.areaSqm ?? 0,
            ) > 0
              ? `${roomType.areaSqm} m²`
              : "";

          const details = [
            capacity,
            bed,
            area,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            `• ${name}` +
            `${details ? ` — ${details}` : ""}`
          );
        },
      );

    const best =
      familyCandidates[0];

    const bestName =
      String(
        best?.name ??
          "loại phòng đầu tiên",
      ).trim();

    let recommendation = "";

    if (
      familyCandidates.length === 1
    ) {
      recommendation =
        `\n\n${bestName} là lựa chọn phù hợp nhất theo sức chứa hiện tại.`;
    } else {
      const widest =
        [...familyCandidates]
          .sort(
            (left, right) =>
              Number(
                right?.areaSqm ?? 0,
              ) -
              Number(
                left?.areaSqm ?? 0,
              ),
          )[0];

      const mostBeds =
        [...familyCandidates]
          .sort(
            (left, right) =>
              Number(
                right?.bedCount ?? 0,
              ) -
              Number(
                left?.bedCount ?? 0,
              ),
          )[0];

      const tips = [];

      if (
        Number(
          mostBeds?.bedCount ?? 0,
        ) > 1
      ) {
        tips.push(
          `nếu ưu tiên nhiều giường, ${mostBeds.name} có ${roomTypeBedText(
            mostBeds,
          )}`,
        );
      }

      if (
        Number(
          widest?.areaSqm ?? 0,
        ) > 0
      ) {
        tips.push(
          `nếu ưu tiên phòng rộng, ${widest.name} có ${widest.areaSqm} m²`,
        );
      }

      recommendation =
        tips.length
          ? `\n\n${tips.join("; ")}.`
          : `\n\n${bestName} đang là lựa chọn phù hợp nhất theo sức chứa.`;
    }

    return {
      answer:
        `${hotel.name ?? "Khách sạn này"} có ${familyCandidates.length} loại phòng phù hợp cho gia đình theo dữ liệu phòng:\n` +
        lines.join("\n") +
        recommendation,

      hotels: [],
      bookings: [],

      suggestedPrompts: [
        "Giá các loại phòng này bao nhiêu?",
        "Phòng nào rộng nhất?",
        "Kiểm tra phòng trống theo ngày đã chọn",
      ],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        "Mình chưa lấy được thông tin các loại phòng của khách sạn lúc này.",

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}

/* =========================================================
 * ROOM TYPE PRICE / COUNT / SIMPLE RANKING INTENTS
 * ========================================================= */

function asksRoomTypePrices(question) {
  const q = normalize(question);

  if (!q) return false;

  return (
    [
      "gia cac loai phong",
      "gia cua cac loai phong",
      "gia nhung loai phong",

      "gia cua 3 loai phong",
      "gia 3 loai phong",
      "3 loai phong gia",

      "moi loai phong bao nhieu",
      "tung loai phong bao nhieu",

      "gia tung loai phong",
      "bang gia phong",
    ].some((pattern) =>
      q.includes(pattern),
    ) ||
    (
      q.includes("gia") &&
      q.includes("loai phong")
    )
  );
}

async function resolveRoomTypePrices(
  question,
  messages,
) {
  if (!asksRoomTypePrices(question)) {
    return null;
  }

  try {
    const {
      hotel,
      roomTypes,
    } =
      await getCurrentHotelRoomTypes(
        messages,
      );

    if (!hotel) {
      return {
        answer:
          "Bạn đang hỏi giá phòng của khách sạn nào? Hãy nhắc tên hoặc chọn khách sạn để mình kiểm tra.",

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    const lines =
      roomTypes.map(
        (roomType) => {
          const name =
            String(
              roomType?.name ??
                "Loại phòng",
            ).trim();

          const price =
            getRoomTypePrice(
              roomType,
            );

          return (
            `• ${name}: ` +
            `${
              price == null
                ? "chưa cập nhật giá"
                : `${money(price)}/đêm`
            }`
          );
        },
      );

    return {
      answer:
        `${hotel.name ?? "Khách sạn này"} hiện có ${roomTypes.length} loại phòng:\n` +
        lines.join("\n") +
        "\n\nĐây là giá niêm yết; giá theo ngày có thể thay đổi do phụ thu và ưu đãi hợp lệ.",

      hotels: [],
      bookings: [],

      suggestedPrompts: [
        "Loại phòng nào rẻ nhất?",
        "Phòng nào phù hợp cho gia đình?",
      ],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        "Mình chưa lấy được bảng giá các loại phòng của khách sạn lúc này.",

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}

function asksRoomTypeCount(question) {
  const q = normalize(question);

  if (!q) return false;

  return [
    "co may loai phong",
    "bao nhieu loai phong",
    "co bao nhieu loai phong",

    "co nhung loai phong nao",
    "nhung loai phong nao",

    "phong co may loai",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

async function resolveRoomTypeCount(
  question,
  messages,
) {
  if (!asksRoomTypeCount(question)) {
    return null;
  }

  try {
    const {
      hotel,
      roomTypes,
    } =
      await getCurrentHotelRoomTypes(
        messages,
      );

    if (!hotel) {
      return {
        answer:
          "Bạn đang hỏi khách sạn nào? Hãy nhắc tên hoặc chọn khách sạn để mình kiểm tra các loại phòng.",

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    const names =
      roomTypes
        .map((roomType) =>
          String(
            roomType?.name ?? "",
          ).trim(),
        )
        .filter(Boolean);

    return {
      answer:
        roomTypes.length === 0
          ? `${hotel.name ?? "Khách sạn này"} hiện chưa có loại phòng nào đang hoạt động.`
          : `${hotel.name ?? "Khách sạn này"} hiện có ${roomTypes.length} loại phòng${
              names.length
                ? `: ${joinVietnameseList(names)}.`
                : "."
            }`,

      hotels: [],
      bookings: [],

      suggestedPrompts: [
        "Giá các loại phòng",
        "Phòng nào phù hợp cho gia đình?",
      ],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        "Mình chưa lấy được danh sách loại phòng của khách sạn lúc này.",

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}

function asksCheapestRoom(question) {
  const q = normalize(question);

  return [
    "phong nao re nhat",
    "loai phong nao re nhat",
    "phong re nhat",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

async function resolveCheapestRoom(
  question,
  messages,
) {
  if (!asksCheapestRoom(question)) {
    return null;
  }

  try {
    const {
      hotel,
      roomTypes,
    } =
      await getCurrentHotelRoomTypes(
        messages,
      );

    if (!hotel) {
      return null;
    }

    const priced =
      roomTypes
        .map((roomType) => ({
          roomType,
          price:
            getRoomTypePrice(
              roomType,
            ),
        }))
        .filter(
          (item) =>
            item.price != null,
        )
        .sort(
          (a, b) =>
            a.price - b.price,
        );

    if (!priced.length) {
      return {
        answer:
          "Các loại phòng hiện chưa có giá niêm yết để so sánh.",

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    const cheapest =
      priced[0];

    return {
      answer:
        `Loại phòng rẻ nhất của ${hotel.name ?? "khách sạn này"} hiện là ` +
        `${cheapest.roomType.name} với giá niêm yết ${money(
          cheapest.price,
        )}/đêm.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return null;
  }
}

function asksLargestRoom(question) {
  const q = normalize(question);

  return [
    "phong nao rong nhat",
    "loai phong nao rong nhat",
    "phong rong nhat",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

async function resolveLargestRoom(
  question,
  messages,
) {
  if (!asksLargestRoom(question)) {
    return null;
  }

  try {
    const {
      hotel,
      roomTypes,
    } =
      await getCurrentHotelRoomTypes(
        messages,
      );

    if (!hotel) {
      return null;
    }

    const sorted =
      [...roomTypes]
        .filter(
          (roomType) =>
            Number(
              roomType?.areaSqm ?? 0,
            ) > 0,
        )
        .sort(
          (left, right) =>
            Number(
              right?.areaSqm ?? 0,
            ) -
            Number(
              left?.areaSqm ?? 0,
            ),
        );

    if (!sorted.length) {
      return {
        answer:
          "Các loại phòng hiện chưa có dữ liệu diện tích để so sánh.",

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    return {
      answer:
        `${sorted[0].name} là loại phòng rộng nhất của ${hotel.name ?? "khách sạn này"}, ` +
        `diện tích ${sorted[0].areaSqm} m².`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return null;
  }
}

/* =========================================================
 * HOTEL CATALOG COUNT / RESULT COUNT
 * ========================================================= */

function asksHotelCatalogCount(question) {
  const q = normalize(question);

  if (!q) return false;

  return [
    "co may khach san",
    "co bao nhieu khach san",
    "bao nhieu khach san",

    "hien co may khach san",
    "hien co bao nhieu khach san",

    "co may hotel",
    "co bao nhieu hotel",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

async function resolveHotelCatalogCount(
  question,
) {
  if (!asksHotelCatalogCount(question)) {
    return null;
  }

  try {
    const hotels =
      await getPublicHotelCatalog();

    const total =
      hotels.length;

    return {
      answer:
        total === 0
          ? "Hiện EnziuRooms chưa có khách sạn nào đang hoạt động."
          : total === 1
            ? `Hiện EnziuRooms có 1 khách sạn đang hoạt động là ${
                hotels[0]?.name ??
                "khách sạn hiện tại"
              }.`
            : `Hiện EnziuRooms có ${total} khách sạn đang hoạt động.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        "Mình chưa lấy được số lượng khách sạn lúc này.",

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}

function asksAboutResultCount(question) {
  const q = normalize(question);

  if (!q) return false;

  return [
    "chi co 1",
    "chi co mot",

    "co moi 1",
    "co moi mot",

    "1 cai thoi",
    "mot cai thoi",

    "het roi a",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

function asksForOtherHotels(question) {
  const q = normalize(question);

  if (!q) return false;

  return [
    "con khach san nao khac",
    "co khach san nao khac",

    "con cai nao khac",

    "co nua khong",
    "con nua khong",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

async function resolveResultCountFollowUp(
  question,
  messages,
) {
  if (
    !asksAboutResultCount(question) &&
    !asksForOtherHotels(question)
  ) {
    return null;
  }

  const latest =
    latestAssistantWithHotels(
      messages,
    );

  const resultHotels =
    Array.isArray(
      latest?.hotels,
    )
      ? latest.hotels
      : [];

  try {
    const catalogHotels =
      await getPublicHotelCatalog();

    const total =
      catalogHotels.length;

    if (total === 1) {
      return {
        answer:
          `Hiện EnziuRooms chỉ có 1 khách sạn đang hoạt động là ${
            catalogHotels[0]?.name ??
            "khách sạn hiện tại"
          }.`,

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    if (
      resultHotels.length === 1
    ) {
      return {
        answer:
          `Hiện EnziuRooms có ${total} khách sạn đang hoạt động. ` +
          `Trong kết quả vừa rồi chỉ có ${
            resultHotels[0]?.name ??
            "1 khách sạn"
          } phù hợp với yêu cầu của bạn.`,

        hotels: [],
        bookings: [],

        presentation: {
          textOnly: true,
        },
      };
    }

    return {
      answer:
        `Hiện EnziuRooms có ${total} khách sạn đang hoạt động.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        resultHotels.length === 1
          ? `Trong kết quả hiện tại mình đang có 1 lựa chọn là ${
              resultHotels[0]?.name ??
              "khách sạn này"
            }.`
          : `Kết quả hiện tại có ${resultHotels.length} lựa chọn.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}

/* =========================================================
 * PROMOTION FOLLOW-UPS
 * ========================================================= */

function asksWithoutPromotion(
  question,
  hasPreviousPromotion,
) {
  const q = normalize(question);

  if (!q) return false;

  const explicit = [
    "khong co ma giam gia",
    "khong dung ma giam gia",
    "khong ap ma giam gia",
    "khong xai ma giam gia",

    "khong co voucher",
    "khong dung voucher",

    "bo voucher",
    "bo ma giam gia",
    "bo ma",

    "gia neu khong giam",
    "gia goc thi sao",
  ];

  if (
    explicit.some((pattern) =>
      q.includes(pattern),
    )
  ) {
    return true;
  }

  if (hasPreviousPromotion) {
    const negative =
      /(?:^|\s)(?:khong|bo)(?:\s|$)/.test(
        q,
      );

    const codeWord =
      /(?:^|\s)(?:ma|code|voucher)(?:\s|$)/.test(
        q,
      );

    return (
      negative &&
      codeWord
    );
  }

  return false;
}

function asksWhichPromotion(question) {
  const q = normalize(question);

  return [
    "ma nao",
    "ma gi",
    "dang dung ma",
    "ap ma nao",
    "voucher nao",
    "khuyen mai nao",
  ].some((pattern) =>
    q.includes(pattern),
  );
}

/* =========================================================
 * CONTEXTUAL MESSAGE
 * ========================================================= */

function isContextDependent(question) {
  const q = normalize(question);

  if (!q) return false;

  const startsLikeFollowUp =
    /^(neu|vay|the|con|roi|ma|nhung|bo|doi|them|giam|tang|khong|gia do|cai do|no)\b/.test(
      q,
    );

  const referential = [
    "thi sao",
    "the nao",

    "cai do",
    "gia do",

    "khach san do",
    "phong do",
    "ma do",

    "con neu",
    "vay neu",

    "doi sang",
    "bo di",
  ].some((pattern) =>
    q.includes(pattern),
  );

  return (
    startsLikeFollowUp ||
    referential ||
    q.split(" ").length <= 7
  );
}

export function buildContextualMessage({
  question,
  messages,
  trip,
  contextualHotel,
}) {
  const raw =
    String(
      question ?? "",
    ).trim();

  if (
    !raw ||
    !isContextDependent(raw)
  ) {
    return raw;
  }

  const latestHotelMessage =
    latestAssistantWithHotels(
      messages,
    );

  const topHotel =
    latestHotelMessage
      ?.hotels?.[0] ??
    null;

  const lastUser =
    latestUserSearch(
      messages,
    );

  const contextLines = [
    lastUser?.content
      ? `Yêu cầu trước: ${lastUser.content}`
      : null,

    topHotel
      ? `Kết quả gần nhất: ${hotelFacts(
          topHotel,
        )}`
      : null,

    contextualHotel?.name
      ? `Khách sạn đang xem: ${contextualHotel.name}`
      : null,

    trip?.checkIn
      ? `Check-in hiện tại: ${trip.checkIn}`
      : null,

    trip?.checkOut
      ? `Check-out hiện tại: ${trip.checkOut}`
      : null,

    trip?.adults
      ? `Người lớn hiện tại: ${trip.adults}`
      : null,

    Number(
      trip?.children,
    ) > 0
      ? `Trẻ em hiện tại: ${trip.children}`
      : null,
  ].filter(Boolean);

  return [
    "Đây là câu hỏi tiếp nối trong cùng cuộc hội thoại EnziuRooms.",

    "Hiểu từ đồng nghĩa, câu rút gọn và đại từ theo ngữ cảnh gần nhất.",

    "Trả lời ngắn gọn, đúng trọng tâm; không lặp card hoặc dữ liệu người dùng không hỏi.",

    ...contextLines,

    `Câu hiện tại: ${raw}`,
  ].join("\n");
}

/* =========================================================
 * MAIN DETERMINISTIC FOLLOW-UP RESOLVER
 * ========================================================= */

export async function resolveDeterministicFollowUp({
  question,
  messages,
  trip,
}) {
  /*
   * Các câu hỏi về ROOM TYPE
   * phải xử lý TRƯỚC generic Hotel Search.
   */

  const familyRoom =
    await resolveFamilyRoom(
      question,
      messages,
      trip,
    );

  if (familyRoom) {
    return familyRoom;
  }

  const roomTypePrices =
    await resolveRoomTypePrices(
      question,
      messages,
    );

  if (roomTypePrices) {
    return roomTypePrices;
  }

  const roomTypeCount =
    await resolveRoomTypeCount(
      question,
      messages,
    );

  if (roomTypeCount) {
    return roomTypeCount;
  }

  const cheapestRoom =
    await resolveCheapestRoom(
      question,
      messages,
    );

  if (cheapestRoom) {
    return cheapestRoom;
  }

  const largestRoom =
    await resolveLargestRoom(
      question,
      messages,
    );

  if (largestRoom) {
    return largestRoom;
  }

  /*
   * Câu hỏi catalog khách sạn.
   */

  const catalogCount =
    await resolveHotelCatalogCount(
      question,
    );

  if (catalogCount) {
    return catalogCount;
  }

  const resultCount =
    await resolveResultCountFollowUp(
      question,
      messages,
    );

  if (resultCount) {
    return resultCount;
  }

  /*
   * Các intent còn lại
   * cần hotel gần nhất.
   */

  const latest =
    latestAssistantWithHotels(
      messages,
    );

  const hotel =
    latest?.hotels?.[0] ??
    null;

  if (!hotel) {
    return null;
  }

  const hasPromotion =
    Boolean(
      hotel.hotelPromotionCode ||
        hotel.platformPromotionCode ||
        Number(
          hotel.hotelPromotionDiscount ??
          0,
        ) > 0 ||
        Number(
          hotel.platformPromotionDiscount ??
          0,
        ) > 0,
    );

  /*
   * Hỏi đang dùng mã gì.
   */

  if (
    asksWhichPromotion(
      question,
    )
  ) {
    const hotelCode =
      hotel.hotelPromotionCode ??
      null;

    const eventCode =
      hotel.platformPromotionCode ??
      null;

    const lines = [];

    if (hotelCode) {
      lines.push(
        `🏨 ${hotelCode} — ưu đãi của khách sạn`,
      );
    }

    if (eventCode) {
      lines.push(
        `🎉 ${eventCode} — ưu đãi sự kiện EnziuRooms`,
      );
    }

    return {
      answer:
        lines.length > 0
          ? `Bạn đang có ${lines.length} mã giảm giá:\n${lines.join(
              "\n",
            )}`
          : `${hotel.name} hiện không có mã giảm giá nào đang được áp dụng.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }

  /*
   * Không phải câu hỏi bỏ mã
   * thì trả null để AI flow khác xử lý.
   */

  if (
    !asksWithoutPromotion(
      question,
      hasPromotion,
    )
  ) {
    return null;
  }

  const grossAmount =
    Number(
      hotel.totalStayAmount,
    );

  if (
    !Number.isFinite(
      grossAmount,
    ) ||
    grossAmount <= 0 ||
    !hotel.hotelId
  ) {
    return {
      answer:
        `Mình cần ngày nhận và trả phòng để tính chính xác giá của ${hotel.name} khi không dùng mã.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }

  try {
    /*
     * Bỏ Hotel Promotion + Event Promotion.
     * Membership vẫn để backend quyết định.
     */
    const preview =
      await previewDiscount({
        hotelId:
          hotel.hotelId,

        amount:
          grossAmount,

        hotelPromotionCode:
          null,

        platformPromotionCode:
          null,
      });

    const finalAmount =
      Number(
        preview?.finalAmount,
      );

    const membershipDiscount =
      Math.max(
        0,
        Number(
          preview?.membershipDiscount ??
            0,
        ) || 0,
      );

    const membershipName =
      preview?.membershipName ??
      hotel.membershipName ??
      null;

    const membershipPercent =
      Number(
        preview?.membershipPercent ??
          hotel.membershipPercent ??
          0,
      ) || 0;

    if (
      !Number.isFinite(
        finalAmount,
      ) ||
      finalAmount < 0
    ) {
      throw new Error(
        "Discount preview không hợp lệ",
      );
    }

    const removedCodes = [
      hotel.hotelPromotionCode,
      hotel.platformPromotionCode,
    ].filter(Boolean);

    const codeText =
      removedCodes.length
        ? joinVietnameseList(
            removedCodes,
          )
        : "các mã giảm giá";

    return {
      answer:
        membershipDiscount > 0
          ? `Nếu bỏ ${codeText}, bạn vẫn được hưởng ${
              membershipName ??
              "ưu đãi thành viên"
            }${
              membershipPercent > 0
                ? ` giảm ${membershipPercent}%`
                : ""
            }. Giá còn ${money(
              finalAmount,
            )}.`
          : `Nếu không dùng ${codeText}, giá là ${money(
              finalAmount,
            )}.`,

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  } catch {
    return {
      answer:
        `Nếu bỏ mã, giá trước ưu đãi hiện là ${money(
          grossAmount,
        )}. ` +
        "Mình chưa tính lại được quyền lợi thành viên nên không tự trừ thêm.",

      hotels: [],
      bookings: [],

      presentation: {
        textOnly: true,
      },
    };
  }
}