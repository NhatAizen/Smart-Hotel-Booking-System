import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Hotel,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import {
  getBookingPricingQuote,
  getHotelAvailability,
  getHotelReviewSummary,
} from "../../services/bookingService";
import {
  getHotels,
  getRoomsByHotel,
  getRoomTypesByHotel,
} from "../../services/hotelService";
import {
  analyzeCopilotRequirement,
  explainCopilotResults,
} from "../../services/copilotService";
import { friendlyErrorMessage } from "../../utils/userFacingText";
import "./BookingCopilotWidget.css";

const AMENITY_OPTIONS = [
  "Hồ bơi",
  "WiFi",
  "Bữa sáng",
  "Bãi đỗ xe",
  "Gym",
  "Spa",
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

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return "Chưa xác định";
  return `${Math.round(Number(value)).toLocaleString("vi-VN")} ₫`;
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function todayInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function locationText(hotel) {
  return [
    hotel?.name,
    hotel?.address,
    hotel?.ward,
    hotel?.district,
    hotel?.city,
    hotel?.province,
  ]
    .filter(Boolean)
    .join(", ");
}

function resolveImage(hotel) {
  const direct =
    hotel?.coverImageUrl ??
    hotel?.imageUrl ??
    hotel?.thumbnailUrl ??
    hotel?.coverUrl ??
    "";

  if (direct) return direct;
  const first = Array.isArray(hotel?.images) ? hotel.images[0] : null;
  if (typeof first === "string") return first;
  return (
    first?.imageUrl ??
    first?.url ??
    first?.fileUrl ??
    first?.publicUrl ??
    ""
  );
}

function normalizedAmenities(hotel, roomType) {
  const values = [
    ...(Array.isArray(hotel?.amenities) ? hotel.amenities : []),
    ...(Array.isArray(roomType?.amenities) ? roomType.amenities : []),
  ];
  return [...new Set(values.filter(Boolean).map(String))];
}

function normalizedRating(summary) {
  const raw = Number(summary?.averageRating);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw <= 5 ? Math.min(1, raw / 5) : Math.min(1, raw / 10);
}

function ratingDisplay(summary) {
  const raw = Number(summary?.averageRating);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function roomListedPrice(room, type) {
  return Number(room?.customPrice ?? type?.basePrice ?? 0);
}

function capacityFits(type, trip) {
  const adults = Math.max(1, Number(trip.adults ?? 1));
  const children = Math.max(0, Number(trip.children ?? 0));
  const requestedRooms = Math.max(1, Number(trip.rooms ?? 1));

  return (
    Number(type?.maxAdults ?? 2) * requestedRooms >= adults &&
    Number(type?.maxChildren ?? 0) * requestedRooms >= children
  );
}

function typeActive(type) {
  const status = String(type?.status ?? "").toUpperCase();
  return !["INACTIVE", "REJECTED", "PENDING"].includes(status);
}

function roomEligible(room, { datesSelected, checkIn, unavailableSet }) {
  const status = String(room?.status ?? "").toUpperCase();
  if (["INACTIVE", "MAINTENANCE"].includes(status)) return false;
  if (datesSelected && unavailableSet.has(String(room?.id))) return false;

  if (datesSelected && checkIn <= todayInput() && status !== "AVAILABLE") {
    return false;
  }
  return true;
}

function findBestRoomSelection(hotel, roomTypes, rooms, trip, unavailableSet) {
  const requestedRooms = Math.max(1, Number(trip.rooms ?? 1));
  const groups = roomTypes
    .filter(typeActive)
    .filter((type) => capacityFits(type, trip))
    .map((type) => {
      const typeRooms = rooms
        .filter((room) => String(room?.roomTypeId ?? room?.roomType?.id) === String(type.id))
        .filter((room) =>
          roomEligible(room, {
            datesSelected: trip.datesSelected,
            checkIn: trip.checkIn,
            unavailableSet,
          }),
        )
        .sort(
          (left, right) =>
            roomListedPrice(left, type) - roomListedPrice(right, type),
        );

      return {
        type,
        rooms: typeRooms,
        selectedRooms: typeRooms.slice(0, requestedRooms),
      };
    })
    .filter((group) => group.selectedRooms.length >= requestedRooms)
    .sort((left, right) => {
      const leftPrice = left.selectedRooms.reduce(
        (sum, room) => sum + roomListedPrice(room, left.type),
        0,
      );
      const rightPrice = right.selectedRooms.reduce(
        (sum, room) => sum + roomListedPrice(room, right.type),
        0,
      );
      return leftPrice - rightPrice;
    });

  return groups[0] ?? null;
}

function amenityMatches(requested, actual) {
  const actualNormalized = actual.map(normalize);
  return requested.filter((item) => {
    const expected = normalize(item);
    return actualNormalized.some(
      (value) => value.includes(expected) || expected.includes(value),
    );
  });
}

function computeBudgetStatus(preferences, pricing) {
  const budget = Number(preferences?.budget);
  if (!Number.isFinite(budget) || budget <= 0) return "NONE";

  const mode = preferences?.budgetMode === "PER_NIGHT" ? "PER_NIGHT" : "TOTAL";
  const comparable =
    mode === "PER_NIGHT" ? pricing.nightlyAmount : pricing.totalAmount;

  if (comparable == null || !Number.isFinite(Number(comparable))) {
    return "UNKNOWN";
  }
  return Number(comparable) <= budget ? "WITHIN" : "OVER";
}

function budgetScore(status, preferences, pricing) {
  if (status === "NONE") return null;
  if (status === "WITHIN") return 1;
  if (status === "UNKNOWN") return 0.5;

  const budget = Number(preferences.budget);
  const comparable =
    preferences.budgetMode === "PER_NIGHT"
      ? Number(pricing.nightlyAmount)
      : Number(pricing.totalAmount);
  if (!Number.isFinite(comparable) || comparable <= 0) return 0.35;
  return Math.max(0, Math.min(1, budget / comparable));
}

function weightedScore(parts) {
  let weight = 0;
  let total = 0;

  parts.forEach(({ score, points }) => {
    if (score == null) return;
    weight += points;
    total += Math.max(0, Math.min(1, score)) * points;
  });

  if (!weight) return 0;
  return Math.round((total / weight) * 100);
}

function candidateReasons({
  locationMatched,
  requestedAmenities,
  matchedAmenities,
  budgetStatus,
  rating,
  reviewCount,
  trip,
  availableRoomCount,
  pricingChecked,
}) {
  const reasons = [];

  if (locationMatched) reasons.push("Đúng khu vực bạn ưu tiên");
  if (budgetStatus === "WITHIN") reasons.push("Nằm trong ngân sách");
  if (
    requestedAmenities.length > 0 &&
    matchedAmenities.length === requestedAmenities.length
  ) {
    reasons.push("Đủ tiện nghi bạn yêu cầu");
  } else if (matchedAmenities.length > 0) {
    reasons.push(`Khớp ${matchedAmenities.length}/${requestedAmenities.length} tiện nghi`);
  }

  if (rating != null && ((rating <= 5 && rating >= 4) || rating >= 8)) {
    reasons.push(`Được đánh giá tốt${reviewCount ? ` từ ${reviewCount} lượt đánh giá` : ""}`);
  }

  if (trip.datesSelected && availableRoomCount >= trip.rooms) {
    reasons.push(`Có ${availableRoomCount} phòng phù hợp theo ngày đã chọn`);
  }

  if (trip.datesSelected && pricingChecked) {
    reasons.push("Tổng giá đã được tính theo ngày và số phòng bạn chọn");
  }

  return reasons.slice(0, 4);
}

async function buildCandidate(hotel, preferences, trip) {
  const availabilityPromise = trip.datesSelected
    ? getHotelAvailability(hotel.id, trip.checkIn, trip.checkOut)
    : Promise.resolve(null);

  const [typesResult, roomsResult, reviewResult, availabilityResult] =
    await Promise.allSettled([
      getRoomTypesByHotel(hotel.id),
      getRoomsByHotel(hotel.id),
      getHotelReviewSummary(hotel.id),
      availabilityPromise,
    ]);

  if (typesResult.status !== "fulfilled" || roomsResult.status !== "fulfilled") {
    return null;
  }

  const roomTypes = listOf(typesResult.value);
  const rooms = listOf(roomsResult.value);
  const reviewSummary =
    reviewResult.status === "fulfilled" ? reviewResult.value ?? {} : {};
  const availability =
    availabilityResult.status === "fulfilled" ? availabilityResult.value : null;

  if (
    trip.datesSelected &&
    (availabilityResult.status !== "fulfilled" || availability == null)
  ) {
    return null;
  }

  const unavailableSet = new Set(
    Array.isArray(availability?.unavailableRoomIds)
      ? availability.unavailableRoomIds.map(String)
      : [],
  );

  const selected = findBestRoomSelection(
    hotel,
    roomTypes,
    rooms,
    trip,
    unavailableSet,
  );
  if (!selected) return null;

  const selectedRooms = selected.selectedRooms;
  const listedNightlyTotal = selectedRooms.reduce(
    (sum, room) => sum + roomListedPrice(room, selected.type),
    0,
  );
  const listedNightlyAmount =
    selectedRooms.length > 0
      ? listedNightlyTotal / Math.max(1, selectedRooms.length)
      : Number(selected.type?.basePrice ?? 0);

  let quote = null;
  if (trip.datesSelected && selectedRooms.length >= trip.rooms) {
    try {
      quote = await getBookingPricingQuote({
        hotelId: hotel.id,
        roomIds: selectedRooms.map((room) => room.id),
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
      });
    } catch {
      quote = null;
    }
  }

  const totalAmount =
    quote?.totalAmount != null ? Number(quote.totalAmount) : null;
  const nightlyAmount =
    totalAmount != null && trip.nights > 0
      ? totalAmount / trip.nights / Math.max(1, trip.rooms)
      : listedNightlyAmount || null;

  const actualAmenities = normalizedAmenities(hotel, selected.type);
  const requestedAmenities = preferences.amenities ?? [];
  const matchedAmenities = amenityMatches(requestedAmenities, actualAmenities);

  const hotelLocation = locationText(hotel);
  const locationMatched = preferences.destination
    ? normalize(hotelLocation).includes(normalize(preferences.destination))
    : true;

  const ratingNorm = normalizedRating(reviewSummary);
  const rating = ratingDisplay(reviewSummary);
  const reviewCount = Number(reviewSummary?.reviewCount ?? 0);

  const pricing = {
    totalAmount,
    nightlyAmount,
  };
  const budgetStatus = computeBudgetStatus(preferences, pricing);
  const budgetMatchScore = budgetScore(budgetStatus, preferences, pricing);

  const amenityScore =
    requestedAmenities.length > 0
      ? matchedAmenities.length / requestedAmenities.length
      : null;

  const reviewScore = preferences.preferGoodReviews
    ? ratingNorm ?? 0.35
    : ratingNorm != null
      ? ratingNorm
      : null;

  const stars = Number(hotel?.starRating ?? 0);
  const starScore =
    preferences.minStars != null
      ? stars >= preferences.minStars
        ? 1
        : Math.max(0, stars / preferences.minStars)
      : stars > 0
        ? Math.min(1, stars / 5)
        : null;

  const matchPercent = weightedScore([
    {
      score: preferences.destination ? (locationMatched ? 1 : 0) : null,
      points: 20,
    },
    { score: budgetMatchScore, points: 25 },
    { score: amenityScore, points: 15 },
    { score: reviewScore, points: 15 },
    { score: starScore, points: 5 },
    { score: 1, points: 10 },
    { score: trip.datesSelected ? 1 : null, points: 10 },
  ]);

  const availableRoomCount = trip.datesSelected
    ? selected.rooms.length
    : null;

  return {
    id: hotel.id,
    name: hotel.name ?? "Khách sạn",
    image: resolveImage(hotel),
    location: hotelLocation,
    stars,
    roomTypeName: selected.type?.name ?? "Loại phòng phù hợp",
    matchPercent,
    totalAmount,
    nightlyAmount,
    listedNightlyAmount,
    pricingChecked: Boolean(quote?.totalAmount != null),
    availabilityChecked: trip.datesSelected && availability != null,
    availableRoomCount,
    averageRating: rating,
    reviewCount,
    requestedAmenities,
    matchedAmenities,
    budgetStatus,
    reasons: candidateReasons({
      locationMatched,
      requestedAmenities,
      matchedAmenities,
      budgetStatus,
      rating,
      reviewCount,
      trip,
      availableRoomCount,
      pricingChecked: Boolean(quote?.totalAmount != null),
    }),
  };
}

function bookingUrl(candidate, trip) {
  const params = new URLSearchParams();
  if (trip.checkIn) params.set("checkIn", trip.checkIn);
  if (trip.checkOut) params.set("checkOut", trip.checkOut);
  params.set("adults", String(trip.adults));
  params.set("children", String(trip.children));
  params.set("rooms", String(trip.rooms));
  params.set("guests", String(Number(trip.adults) + Number(trip.children)));
  return `/hotels/${candidate.id}?${params.toString()}#rooms`;
}

export default function BookingCopilotWidget() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const normalizedRole = String(user?.role ?? "")
    .replace(/^ROLE_/i, "")
    .trim()
    .toUpperCase();

  const hiddenRoute =
    location.pathname.startsWith("/customer/checkout") ||
    location.pathname.startsWith("/payment/") ||
    location.pathname.startsWith("/hotel-admin") ||
    location.pathname.startsWith("/admin");

  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [requirement, setRequirement] = useState(
    "Tôi muốn khách sạn giá hợp lý, review tốt và có hồ bơi.",
  );
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [budget, setBudget] = useState("");
  const [budgetMode, setBudgetMode] = useState("TOTAL");
  const [manualAmenities, setManualAmenities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [locationFallback, setLocationFallback] = useState(false);

  const datesSelected = Boolean(checkIn && checkOut && checkOut > checkIn);
  const nights = nightsBetween(checkIn, checkOut);

  const budgetLabel = useMemo(() => {
    const value = Number(budget);
    if (!Number.isFinite(value) || value <= 0) return "";
    return `${formatMoney(value)} ${
      budgetMode === "PER_NIGHT" ? "/ đêm" : "cho cả kỳ nghỉ"
    }`;
  }, [budget, budgetMode]);

  if (
    hiddenRoute ||
    !isAuthenticated ||
    normalizedRole !== "CUSTOMER"
  ) {
    return null;
  }

  function toggleAmenity(value) {
    setManualAmenities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function runCopilot(event) {
    event?.preventDefault?.();
    setError("");
    setResults([]);
    setSummary("");
    setAnalysis(null);
    setLocationFallback(false);

    if (checkIn && !checkOut) {
      setError("Bạn đã chọn ngày nhận phòng; hãy chọn cả ngày trả phòng.");
      return;
    }
    if (checkOut && !checkIn) {
      setError("Bạn đã chọn ngày trả phòng; hãy chọn cả ngày nhận phòng.");
      return;
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      setError("Ngày trả phòng phải sau ngày nhận phòng.");
      return;
    }

    setLoading(true);

    try {
      setProgress("Đang hiểu yêu cầu của bạn...");
      const parsed = await analyzeCopilotRequirement(requirement);

      const manualBudget = Number(budget);
      const effective = {
        destination: destination.trim() || parsed.destination || "",
        budget:
          Number.isFinite(manualBudget) && manualBudget > 0
            ? manualBudget
            : parsed.budget,
        budgetMode:
          Number.isFinite(manualBudget) && manualBudget > 0
            ? budgetMode
            : parsed.budgetMode ?? "TOTAL",
        amenities: [
          ...new Set([
            ...(Array.isArray(parsed.amenities) ? parsed.amenities : []),
            ...manualAmenities,
          ]),
        ],
        preferGoodReviews: parsed.preferGoodReviews,
        minStars: parsed.minStars,
        analysisSource: parsed.analysisSource,
      };
      setAnalysis(effective);

      const trip = {
        checkIn,
        checkOut,
        adults: Math.max(1, Number(adults)),
        children: Math.max(0, Number(children)),
        rooms: Math.max(1, Number(rooms)),
        datesSelected,
        nights,
      };

      setProgress("Đang tìm khách sạn và phòng phù hợp...");
      const hotelResponse = await getHotels();
      let hotels = listOf(hotelResponse).filter((hotel) => {
        const status = String(hotel?.status ?? "").toUpperCase();
        return !["REJECTED", "INACTIVE", "PENDING"].includes(status);
      });

      if (effective.destination) {
        const matching = hotels.filter((hotel) =>
          normalize(locationText(hotel)).includes(
            normalize(effective.destination),
          ),
        );
        if (matching.length > 0) {
          hotels = matching;
        } else {
          setLocationFallback(true);
        }
      }

      hotels = hotels
        .sort(
          (left, right) =>
            Number(right?.starRating ?? 0) - Number(left?.starRating ?? 0),
        )
        .slice(0, 12);

      if (hotels.length === 0) {
        throw new Error("Hiện chưa có khách sạn phù hợp để Copilot phân tích.");
      }

      setProgress(
        datesSelected
          ? "Đang kiểm tra phòng trống và tổng giá..."
          : "Đang đối chiếu phòng, mức giá và đánh giá...",
      );

      const built = await Promise.all(
        hotels.map((hotel) => buildCandidate(hotel, effective, trip)),
      );
      let candidates = built
        .filter(Boolean)
        .sort((left, right) => right.matchPercent - left.matchPercent);

      if (effective.budget) {
        const within = candidates.filter(
          (candidate) => candidate.budgetStatus === "WITHIN",
        );
        if (within.length > 0) {
          candidates = within;
        }
      }

      const top = candidates.slice(0, 3).map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }));

      if (top.length === 0) {
        setResults([]);
        setSummary("");
        setError(
          datesSelected
            ? "Không tìm thấy phòng đáp ứng số khách/số phòng trong kỳ nghỉ này. Hãy thử đổi ngày hoặc giảm tiêu chí."
            : "Không tìm thấy loại phòng phù hợp với số khách hiện tại.",
        );
        return;
      }

      setResults(top);
      setProgress("Đang hoàn thiện gợi ý cho bạn...");
      const explanation = await explainCopilotResults(requirement, top, {
        datesSelected,
      });
      setSummary(explanation);
    } catch (requestError) {
      setError(
        friendlyErrorMessage(
          requestError,
          "Enziu AI chưa thể đưa ra gợi ý lúc này. Vui lòng thử lại.",
        ),
      );
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <>
      <button
        type="button"
        className="enziu-copilot-launcher"
        onClick={() => setOpen(true)}
        aria-label="Mở gợi ý thông minh EnziuRooms"
        title="Gợi ý thông minh"
      >
        <Sparkles size={20} />
        <span>Gợi ý cho bạn</span>
      </button>

      {open ? (
        <section
          className="enziu-copilot-panel"
          aria-label="Gợi ý thông minh EnziuRooms"
        >
          <header className="enziu-copilot-header">
            <div className="enziu-copilot-brand">
              <span>
                <Bot size={22} />
              </span>
              <div>
                <strong>Enziu AI</strong>
                <small>Gợi ý nơi ở phù hợp với chuyến đi của bạn</small>
              </div>
            </div>
            <button
              type="button"
              className="enziu-copilot-close"
              onClick={() => setOpen(false)}
              aria-label="Đóng gợi ý thông minh"
            >
              <X size={20} />
            </button>
          </header>

          <div className="enziu-copilot-body">
            <div className="enziu-copilot-proof">
              <ShieldCheck size={18} />
              <span>
                Giá, phòng trống và đánh giá được kiểm tra theo lựa chọn hiện có
                trên EnziuRooms.
              </span>
            </div>

            <form onSubmit={runCopilot} className="enziu-copilot-form">
              <label className="enziu-copilot-field">
                <span>Bạn cần chuyến đi như thế nào?</span>
                <textarea
                  value={requirement}
                  onChange={(event) => setRequirement(event.target.value)}
                  placeholder="VD: Tôi có 2 triệu, muốn ở Quận 1, có hồ bơi và review tốt."
                  rows={3}
                />
              </label>

              <button
                type="button"
                className="enziu-copilot-advanced-toggle"
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                <span>Thêm thông tin chuyến đi</span>
                <ChevronDown
                  size={18}
                  className={advancedOpen ? "open" : ""}
                />
              </button>

              {advancedOpen ? (
                <div className="enziu-copilot-advanced">
                  <label className="enziu-copilot-field">
                    <span>
                      <MapPin size={15} /> Khu vực / địa điểm
                    </span>
                    <input
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                      placeholder="VD: Quận 1, Hồ Chí Minh"
                    />
                  </label>

                  <div className="enziu-copilot-grid two">
                    <label className="enziu-copilot-field">
                      <span>
                        <CalendarDays size={15} /> Nhận phòng
                      </span>
                      <input
                        type="date"
                        min={todayInput()}
                        value={checkIn}
                        onChange={(event) => setCheckIn(event.target.value)}
                      />
                    </label>
                    <label className="enziu-copilot-field">
                      <span>
                        <CalendarDays size={15} /> Trả phòng
                      </span>
                      <input
                        type="date"
                        min={checkIn || todayInput()}
                        value={checkOut}
                        onChange={(event) => setCheckOut(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="enziu-copilot-grid three">
                    <label className="enziu-copilot-field">
                      <span>Người lớn</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={adults}
                        onChange={(event) => setAdults(event.target.value)}
                      />
                    </label>
                    <label className="enziu-copilot-field">
                      <span>Trẻ em</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={children}
                        onChange={(event) => setChildren(event.target.value)}
                      />
                    </label>
                    <label className="enziu-copilot-field">
                      <span>Số phòng</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={rooms}
                        onChange={(event) => setRooms(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="enziu-copilot-budget-row">
                    <label className="enziu-copilot-field">
                      <span>
                        <CircleDollarSign size={15} /> Ngân sách tối đa
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={budget}
                        onChange={(event) => setBudget(event.target.value)}
                        placeholder="VD: 2000000"
                      />
                    </label>
                    <label className="enziu-copilot-field compact">
                      <span>Cách tính</span>
                      <select
                        value={budgetMode}
                        onChange={(event) => setBudgetMode(event.target.value)}
                      >
                        <option value="TOTAL">Cả kỳ nghỉ</option>
                        <option value="PER_NIGHT">Mỗi đêm</option>
                      </select>
                    </label>
                  </div>

                  <div className="enziu-copilot-field">
                    <span>Tiện nghi ưu tiên</span>
                    <div className="enziu-copilot-chips">
                      {AMENITY_OPTIONS.map((amenity) => {
                        const selected = manualAmenities.includes(amenity);
                        return (
                          <button
                            type="button"
                            key={amenity}
                            className={selected ? "active" : ""}
                            onClick={() => toggleAmenity(amenity)}
                          >
                            {selected ? <Check size={14} /> : null}
                            {amenity}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                className="enziu-copilot-submit"
                disabled={loading}
              >
                {loading ? (
                  <LoaderCircle size={19} className="spin" />
                ) : (
                  <Search size={19} />
                )}
                {loading ? progress || "Đang tìm lựa chọn phù hợp..." : "Tìm lựa chọn phù hợp"}
              </button>
            </form>

            {analysis ? (
              <div className="enziu-copilot-understood">
                <strong>
                  <Sparkles size={16} />
                  Mình đã hiểu
                </strong>
                <div>
                  {analysis.destination ? (
                    <span>📍 {analysis.destination}</span>
                  ) : null}
                  {analysis.budget ? (
                    <span>
                      💰 {formatMoney(analysis.budget)} ·{" "}
                      {analysis.budgetMode === "PER_NIGHT"
                        ? "mỗi đêm"
                        : "cả kỳ nghỉ"}
                    </span>
                  ) : null}
                  {analysis.amenities?.length ? (
                    <span>✨ {analysis.amenities.join(", ")}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {locationFallback ? (
              <div className="enziu-copilot-warning">
                Chưa tìm thấy khách sạn đúng khu vực bạn nhập. Mình vẫn gợi ý theo các tiêu chí còn lại để bạn tham khảo.
              </div>
            ) : null}

            {error ? <div className="enziu-copilot-error">{error}</div> : null}

            {results.length > 0 ? (
              <div className="enziu-copilot-results">
                <div className="enziu-copilot-result-heading">
                  <div>
                    <span>GỢI Ý CHO BẠN</span>
                    <h3>Top {results.length} phù hợp nhất</h3>
                  </div>
                  {budgetLabel ? <small>{budgetLabel}</small> : null}
                </div>

                {summary ? (
                  <div className="enziu-copilot-summary">
                    <Bot size={18} />
                    <p>{summary}</p>
                  </div>
                ) : null}

                <div className="enziu-copilot-cards">
                  {results.map((candidate) => (
                    <article
                      className="enziu-copilot-card"
                      key={candidate.id}
                    >
                      <div className="enziu-copilot-card-media">
                        {candidate.image ? (
                          <img src={candidate.image} alt={candidate.name} />
                        ) : (
                          <div className="enziu-copilot-image-fallback">
                            <Hotel size={30} />
                          </div>
                        )}
                        <span className="enziu-copilot-rank">
                          #{candidate.rank}
                        </span>
                        <strong className="enziu-copilot-match">
                          {candidate.matchPercent}% phù hợp
                        </strong>
                      </div>

                      <div className="enziu-copilot-card-content">
                        <div className="enziu-copilot-hotel-row">
                          <div>
                            <h4>{candidate.name}</h4>
                            <p>
                              <MapPin size={14} />
                              {candidate.location || "Chưa có địa chỉ"}
                            </p>
                          </div>
                          {candidate.averageRating != null ? (
                            <span className="enziu-copilot-rating">
                              <Star size={13} fill="currentColor" />
                              {candidate.averageRating}
                            </span>
                          ) : null}
                        </div>

                        <div className="enziu-copilot-room-line">
                          <Users size={15} />
                          <span>{candidate.roomTypeName}</span>
                        </div>

                        <div className="enziu-copilot-price">
                          {candidate.pricingChecked ? (
                            <>
                              <span>
                                Tổng {nights} đêm · {rooms} phòng
                              </span>
                              <strong>
                                {formatMoney(candidate.totalAmount)}
                              </strong>
                              <small>
                                ≈ {formatMoney(candidate.nightlyAmount)}/phòng/đêm
                              </small>
                            </>
                          ) : (
                            <>
                              <span>Giá niêm yết từ</span>
                              <strong>
                                {formatMoney(candidate.nightlyAmount)}
                              </strong>
                              <small>
                                /phòng/đêm · chọn ngày để xem tổng giá
                              </small>
                            </>
                          )}
                        </div>

                        <div className="enziu-copilot-availability">
                          {candidate.availabilityChecked ? (
                            <>
                              <ShieldCheck size={15} />
                              <span>
                                Còn {candidate.availableRoomCount} phòng phù hợp
                              </span>
                            </>
                          ) : (
                            <>
                              <CalendarDays size={15} />
                              <span>Chọn ngày để kiểm tra phòng trống</span>
                            </>
                          )}
                        </div>

                        {candidate.budgetStatus === "OVER" ? (
                          <div className="enziu-copilot-overbudget">
                            Vượt mức ngân sách đã đặt
                          </div>
                        ) : null}

                        <ul className="enziu-copilot-reasons">
                          {candidate.reasons.map((reason) => (
                            <li key={reason}>
                              <Check size={14} />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="enziu-copilot-card-actions">
                          <Link to={bookingUrl(candidate, {
                            checkIn,
                            checkOut,
                            adults,
                            children,
                            rooms,
                          })}>
                            Xem khách sạn
                          </Link>
                          <Link
                            className="primary"
                            to={bookingUrl(candidate, {
                              checkIn,
                              checkOut,
                              adults,
                              children,
                              rooms,
                            })}
                          >
                            Chọn phòng
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="enziu-copilot-method">
                  <ShieldCheck size={17} />
                  <span>
                    Mức độ phù hợp được tính từ vị trí, ngân sách, tiện nghi,
                    đánh giá, sức chứa và tình trạng phòng theo ngày bạn chọn.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
