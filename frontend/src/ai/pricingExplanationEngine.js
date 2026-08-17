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

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
  const numeric = numberOrNull(value);
  if (numeric == null) return "—";
  return `${Math.round(numeric).toLocaleString("vi-VN")} ₫`;
}

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

function extractBudget(question) {
  const raw = String(question ?? "").toLowerCase();

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

function asksWhyPriceChanged(question) {
  const q = normalize(question);
  if (!q) return false;

  const why = ["tai sao", "vi sao", "sao lai", "sao"].some((pattern) =>
    q.includes(pattern),
  );
  const priceLanguage = [
    "gia",
    "tang",
    "len",
    "mac hon",
    "dat hon",
    "chenh",
    "phu thu",
    "thanh",
  ].some((pattern) => q.includes(pattern));
  const hasMoneyLike = /(?:^|\s)\d+(?:\s)*(?:k|tr|nghin|ngan|dong|vnd)(?:\s|$)/.test(q);

  return (
    (why && (priceLanguage || hasMoneyLike)) ||
    ["gia len", "gia tang", "chenh gia", "chenh lech", "phu thu"].some((pattern) =>
      q.includes(pattern),
    )
  );
}

function asksCanAfford(question) {
  const q = normalize(question);
  const budget = extractBudget(question);
  if (!q || budget == null) return false;

  const intent = [
    "duoc khong",
    "du khong",
    "dat duoc khong",
    "co du khong",
    "co dat duoc",
    "khach san nay duoc",
    "o duoc khong",
    "co o duoc",
  ].some((pattern) => q.includes(pattern));

  return intent || /(?:^|\s)(?:toi|minh)\s+co\s+\d/.test(q);
}

function isoDateLabel(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function dayNameFromIso(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const labels = [
    "Chủ nhật",
    "Thứ hai",
    "Thứ ba",
    "Thứ tư",
    "Thứ năm",
    "Thứ sáu",
    "Thứ bảy",
  ];
  return labels[date.getUTCDay()] ?? null;
}

function percentFromAmount(amount, base) {
  const safeAmount = numberOrNull(amount);
  const safeBase = numberOrNull(base);
  if (safeAmount == null || safeBase == null || safeAmount <= 0 || safeBase <= 0) {
    return null;
  }
  return Math.round((safeAmount / safeBase) * 100);
}

function promotionNames(hotel) {
  const result = [];

  if (hotel?.hotelPromotionCode) {
    result.push(`mã ${hotel.hotelPromotionCode} của khách sạn`);
  }

  if (hotel?.platformPromotionCode) {
    result.push(`mã ${hotel.platformPromotionCode} của sự kiện EnziuRooms`);
  }

  return result;
}

function buildPriceExplanation(hotel, trip) {
  const listedNightly = numberOrNull(hotel?.pricePerNight);
  const baseAmount = numberOrNull(hotel?.baseStayAmount);
  const weekend = Math.max(0, numberOrNull(hotel?.weekendSurchargeAmount) ?? 0);
  const special = Math.max(0, numberOrNull(hotel?.specialDateSurchargeAmount) ?? 0);
  const gross = numberOrNull(hotel?.totalStayAmount);
  const finalAmount = numberOrNull(hotel?.finalPayableAmount);
  const membershipDiscount = Math.max(0, numberOrNull(hotel?.membershipDiscount) ?? 0);
  const hotelDiscount = Math.max(0, numberOrNull(hotel?.hotelPromotionDiscount) ?? 0);
  const platformDiscount = Math.max(0, numberOrNull(hotel?.platformPromotionDiscount) ?? 0);
  const totalDiscount = Math.max(0, numberOrNull(hotel?.totalDiscount) ?? 0);
  const nights = Math.max(0, Number(hotel?.stayNights ?? 0) || 0);

  if (!hotel?.pricingChecked || gross == null) {
    if (listedNightly != null) {
      return (
        `Giá ${money(listedNightly)}/đêm bạn đang thấy là giá niêm yết của phòng. ` +
        "Để giải thích chính xác vì sao giá ở một ngày cụ thể tăng hoặc giảm, mình cần ngày nhận và trả phòng để hệ thống tính giá theo ngày."
      );
    }

    return "Mình chưa có đủ dữ liệu giá theo ngày để giải thích chính xác khoản chênh lệch này.";
  }

  const effectiveBase = baseAmount ?? (nights === 1 ? listedNightly : null);
  const parts = [];

  if (effectiveBase != null) {
    parts.push(`Giá cơ bản${nights > 1 ? ` cho ${nights} đêm` : ""}: ${money(effectiveBase)}`);
  } else if (listedNightly != null) {
    parts.push(`Giá niêm yết: ${money(listedNightly)}/đêm`);
  }

  if (weekend > 0) {
    const percentage = percentFromAmount(weekend, effectiveBase ?? listedNightly);
    const dayName = trip?.checkIn ? dayNameFromIso(trip.checkIn) : null;
    const dateLabel = trip?.checkIn ? isoDateLabel(trip.checkIn) : null;

    if (nights === 1 && dayName && dateLabel) {
      parts.push(
        `${dateLabel} là ${dayName}, nên có phụ thu cuối tuần` +
          `${percentage ? ` +${percentage}%` : ""}: +${money(weekend)}`,
      );
    } else {
      parts.push(
        `Phụ thu cuối tuần${percentage ? ` khoảng +${percentage}%` : ""}: +${money(weekend)}`,
      );
    }
  }

  if (special > 0) {
    const percentage = percentFromAmount(special, effectiveBase ?? listedNightly);
    parts.push(
      `Phụ thu ngày đặc biệt${percentage ? ` khoảng +${percentage}%` : ""}: +${money(special)}`,
    );
  }

  let answer = "Mình tách giá ra cho bạn như sau:\n\n" + parts.map((item) => `• ${item}`).join("\n");
  answer += `\n\n👉 Giá trước ưu đãi: ${money(gross)}.`;

  const expectedGross =
    effectiveBase != null ? effectiveBase + weekend + special : null;

  if (expectedGross != null && Math.abs(expectedGross - gross) <= 1) {
    answer += " Đây là phần chênh do chính sách giá theo ngày của EnziuRooms, không phải mình tự cộng thuế hay phí khác.";
  }

  const discountLines = [];

  if (membershipDiscount > 0) {
    discountLines.push(
      `Quyền lợi ${hotel?.membershipName ?? "thành viên"}${hotel?.membershipPercent ? ` (${hotel.membershipPercent}%)` : ""}: -${money(membershipDiscount)}`,
    );
  }

  if (hotelDiscount > 0) {
    discountLines.push(
      `Mã ${hotel?.hotelPromotionCode ?? "ưu đãi khách sạn"}: -${money(hotelDiscount)}`,
    );
  }

  if (platformDiscount > 0) {
    discountLines.push(
      `Mã ${hotel?.platformPromotionCode ?? "ưu đãi EnziuRooms"}: -${money(platformDiscount)}`,
    );
  }

  if (finalAmount != null && finalAmount < gross) {
    if (discountLines.length) {
      answer += `\n\nSau đó mới áp ưu đãi:\n${discountLines.map((item) => `• ${item}`).join("\n")}`;
    } else if (totalDiscount > 0) {
      answer += `\n\nTổng ưu đãi: -${money(totalDiscount)}.`;
    }

    answer += `\n\n✅ Giá bạn cần trả sau ưu đãi: ${money(finalAmount)}.`;
  }

  return answer;
}

function buildAffordabilityAnswer(hotel, budget) {
  const finalAmount = numberOrNull(hotel?.finalPayableAmount);
  const gross = numberOrNull(hotel?.totalStayAmount);
  const listed = numberOrNull(hotel?.pricePerNight);

  if (hotel?.discountChecked && finalAmount != null) {
    const difference = Math.abs(finalAmount - budget);

    if (budget >= finalAmount) {
      return (
        `Được nhé. Sau khi tính giá theo ngày và các ưu đãi bạn có thể áp dụng, ` +
        `${hotel.name} còn ${money(finalAmount)}. ` +
        `Với ngân sách ${money(budget)}, bạn còn dư ${money(difference)}.`
      );
    }

    return (
      `Chưa đủ nhé. Giá tốt nhất hiện tại của ${hotel.name} sau ưu đãi là ${money(finalAmount)}, ` +
      `trong khi ngân sách của bạn là ${money(budget)}. Bạn còn thiếu ${money(difference)}.`
    );
  }

  if (hotel?.pricingChecked && gross != null) {
    return (
      `Mình đã có giá theo ngày là ${money(gross)} trước ưu đãi, nhưng chưa xác nhận được giá cuối sau quyền lợi thành viên và mã giảm giá. ` +
      `Vì vậy mình chưa muốn kết luận chỉ dựa vào ngân sách ${money(budget)} để tránh báo sai.`
    );
  }

  if (listed != null) {
    return (
      `Giá niêm yết của ${hotel.name} là ${money(listed)}/đêm, nhưng mình chưa thể kết luận ngân sách ${money(budget)} có đủ hay không chỉ từ giá niêm yết. ` +
      "Bạn hãy chọn ngày, mình sẽ tính giá theo ngày và các ưu đãi hợp lệ rồi so lại cho chính xác."
    );
  }

  return "Mình chưa có đủ dữ liệu giá để so với ngân sách của bạn.";
}

export function resolvePricingFollowUp({ question, messages, trip }) {
  const latest = latestAssistantWithHotels(messages);
  const hotel = latest?.hotels?.[0] ?? null;

  if (!hotel) return null;

  if (asksWhyPriceChanged(question)) {
    return {
      answer: buildPriceExplanation(hotel, trip),
      hotels: [],
      bookings: [],
      intent: "PRICE_EXPLANATION",
      copilot: {
        ...(latest?.copilot ?? {}),
        enhanced: true,
        followUpResolved: true,
      },
      suggestedPrompts: [
        "Các ưu đãi đang giảm cho tôi bao nhiêu?",
        "Nếu không dùng mã giảm giá thì sao?",
        "Ngày thường thì giá khoảng bao nhiêu?",
      ],
    };
  }

  if (asksCanAfford(question)) {
    const budget = extractBudget(question);
    if (budget == null) return null;

    return {
      answer: buildAffordabilityAnswer(hotel, budget),
      hotels: [],
      bookings: [],
      intent: "BUDGET_FOLLOW_UP",
      copilot: {
        ...(latest?.copilot ?? {}),
        enhanced: true,
        followUpResolved: true,
      },
      suggestedPrompts: [
        "Giải thích giá này giúp tôi",
        "Có mã giảm giá nào đang được áp dụng?",
        "Tìm lựa chọn rẻ hơn",
      ],
    };
  }

  return null;
}
