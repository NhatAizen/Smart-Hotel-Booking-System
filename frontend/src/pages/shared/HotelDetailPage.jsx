import {
  ArrowLeft,
  Baby,
  Bot,
  Ban,
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Heart,
  Images,
  MapPin,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  Star,
  Users,
  WalletCards,
  Wifi,
  Wind,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useAiAssistant } from "../../ai/AiAssistantContext";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import ReviewExplorerModal from "../../components/review/ReviewExplorerModal";
import {
  getBookingPricingQuote,
  getHotelAvailability,
  getHotelReviews,
  getHotelReviewSummary,
  subscribeHotelAvailability,
} from "../../services/bookingService";
import {
  getHotelById,
  getRoomsByHotel,
  getRoomTypesByHotel,
} from "../../services/hotelService";
import {
  addFavoriteHotel,
  getFavoriteState,
  removeFavoriteHotel,
} from "../../services/favoriteService";
import "./HotelDetailPage.css";

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1500&q=84",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1000&q=84",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=84",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1000&q=84",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1000&q=84",
];

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function defaultDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateInput(date);
}

function formatMoney(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function formatDate(value) {
  if (!value) return "Chưa chọn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value, fallback) {
  if (!value) return fallback;
  return String(value).slice(0, 5);
}

function resolveRoomTypeImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.imageUrl ?? image.url ?? image.fileUrl ?? image.publicUrl ?? image.path ?? "";
}

function roomTypeImageUrls(roomType, fallback = "") {
  if (!roomType) return fallback ? [fallback] : [];
  const cover = roomType.coverImageUrl ?? "";
  const raw = Array.isArray(roomType.images) ? roomType.images : [];
  const urls = [cover, ...raw.map(resolveRoomTypeImageUrl), fallback].filter(Boolean);
  return [...new Set(urls)];
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000));
}

function rangesOverlap(firstCheckIn, firstCheckOut, secondCheckIn, secondCheckOut) {
  if (!firstCheckIn || !firstCheckOut || !secondCheckIn || !secondCheckOut) {
    return true;
  }
  return firstCheckIn < secondCheckOut && firstCheckOut > secondCheckIn;
}

function holdCountdown(expiresAt, nowMs) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - nowMs);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function dedupeImages(items) {
  const seen = new Set();
  return items.filter((item) => {
    const url = typeof item === "string" ? item : item?.url;
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}


function ratingLabel(average) {
  if (average == null) return "Chưa có đánh giá";
  if (average >= 9) return "Xuất sắc";
  if (average >= 8) return "Tuyệt vời";
  if (average >= 7) return "Tốt";
  if (average >= 6) return "Khá tốt";
  return "Ổn";
}

function amenityIcon(name) {
  const normalized = String(name ?? "").toLowerCase();
  if (normalized.includes("wifi")) return <Wifi size={18} />;
  if (normalized.includes("điều hòa") || normalized.includes("điều hoà")) {
    return <Wind size={18} />;
  }
  if (normalized.includes("tắm") || normalized.includes("vòi sen")) {
    return <Bath size={18} />;
  }
  if (normalized.includes("bữa sáng") || normalized.includes("nhà hàng")) {
    return <Coffee size={18} />;
  }
  return <CheckCircle2 size={18} />;
}

export default function HotelDetailPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { openAssistant } = useAiAssistant();
  const isCustomer =
    isAuthenticated
    && String(user?.role ?? "")
      .replace(/^ROLE_/i, "")
      .trim()
      .toUpperCase() === "CUSTOMER";
  const [searchParams] = useSearchParams();

  const sectionRefs = useRef({});
  const guestPickerRef = useRef(null);

  const [hotel, setHotel] = useState(null);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [unavailableRoomIds, setUnavailableRoomIds] = useState([]);
  const [heldRooms, setHeldRooms] = useState([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const [holdClockMs, setHoldClockMs] = useState(() => Date.now());
  const [reviewSummary, setReviewSummary] = useState({
    reviewCount: 0,
    averageRating: null,
    ratingDistribution: {},
  });
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [roomTypeDetail, setRoomTypeDetail] = useState(null);
  const [roomTypeDetailImageIndex, setRoomTypeDetailImageIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [selectionPricing, setSelectionPricing] = useState(null);
  const [selectionPricingLoading, setSelectionPricingLoading] = useState(false);
  const [roomTypePricing, setRoomTypePricing] = useState(null);
  const [roomTypePricingLoading, setRoomTypePricingLoading] = useState(false);
  const [roomTypePricingError, setRoomTypePricingError] = useState("");

  const [searchForm, setSearchForm] = useState(() => ({
    checkIn: searchParams.get("checkIn") || defaultDate(1),
    checkOut: searchParams.get("checkOut") || defaultDate(2),
    adults: Number(
      searchParams.get("adults") ?? searchParams.get("guests") ?? 2,
    ),
    children: Number(searchParams.get("children") ?? 0),
    rooms: Number(searchParams.get("rooms") ?? 1),
  }));

  const initialSearchRef = useRef({
    checkIn: searchForm.checkIn,
    checkOut: searchForm.checkOut,
  });

  useEffect(() => {
    let active = true;

    async function loadFavoriteState() {
      if (!isCustomer || !hotelId) {
        if (active) setFavorite(false);
        return;
      }

      try {
        const state = await getFavoriteState(hotelId);
        if (active) setFavorite(Boolean(state?.favorite));
      } catch {
        if (active) setFavorite(false);
      }
    }

    loadFavoriteState();

    return () => {
      active = false;
    };
  }, [hotelId, isCustomer]);

  const galleryImages = useMemo(() => {
    const hotelImages = Array.isArray(hotel?.images) ? hotel.images : [];
    const roomImages = roomTypes.flatMap((type) =>
      Array.isArray(type.images) ? type.images : [],
    );
    const actual = dedupeImages([...hotelImages, ...roomImages]).map(
      (item) => (typeof item === "string" ? item : item.url),
    );
    return actual.length > 0 ? actual : FALLBACK_IMAGES;
  }, [hotel, roomTypes]);

  const loadAvailability = useCallback(
    async (values = searchForm) => {
      if (!values.checkIn || !values.checkOut) return;

      if (values.checkOut <= values.checkIn) {
        setAvailabilityError("Ngày trả phòng phải sau ngày nhận phòng.");
        return;
      }

      setAvailabilityLoading(true);
      setAvailabilityError("");

      try {
        const response = await getHotelAvailability(
          hotelId,
          values.checkIn,
          values.checkOut,
        );
        setUnavailableRoomIds(
          Array.isArray(response?.unavailableRoomIds)
            ? response.unavailableRoomIds
            : [],
        );
        setHeldRooms(Array.isArray(response?.heldRooms) ? response.heldRooms : []);
      } catch (requestError) {
        setUnavailableRoomIds([]);
        setHeldRooms([]);
        setAvailabilityError(
          requestError.response?.data?.message ??
            "Không thể kiểm tra phòng trống theo ngày đã chọn.",
        );
      } finally {
        setAvailabilityLoading(false);
      }
    },
    [hotelId, searchForm],
  );

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setError("");

      try {
        const [hotelData, typeData, roomData, availabilityData] =
          await Promise.all([
            getHotelById(hotelId),
            getRoomTypesByHotel(hotelId),
            getRoomsByHotel(hotelId),
            getHotelAvailability(
              hotelId,
              initialSearchRef.current.checkIn,
              initialSearchRef.current.checkOut,
            ).catch(() => ({ unavailableRoomIds: [] })),
          ]);

        setHotel(hotelData);
        setRoomTypes(Array.isArray(typeData) ? typeData : []);
        setRooms(Array.isArray(roomData) ? roomData : []);
        setUnavailableRoomIds(
          Array.isArray(availabilityData?.unavailableRoomIds)
            ? availabilityData.unavailableRoomIds
            : [],
        );
        setHeldRooms(
          Array.isArray(availabilityData?.heldRooms)
            ? availabilityData.heldRooms
            : [],
        );

        const [summaryResult, reviewsResult] = await Promise.allSettled([
          getHotelReviewSummary(hotelId),
          getHotelReviews(hotelId),
        ]);

        if (summaryResult.status === "fulfilled") {
          setReviewSummary(summaryResult.value);
        }
        if (reviewsResult.status === "fulfilled") {
          setReviews(
            Array.isArray(reviewsResult.value) ? reviewsResult.value : [],
          );
        }
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ??
            "Không thể tải thông tin khách sạn.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [hotelId]);

  useEffect(() => {
    function handleOutside(event) {
      if (
        guestPickerRef.current &&
        !guestPickerRef.current.contains(event.target)
      ) {
        setGuestPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    const sections = Object.entries(sectionRefs.current)
      .map(([id, element]) => ({ id, element }))
      .filter((item) => item.element);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.dataset?.section) {
          setActiveSection(visible.target.dataset.section);
        }
      },
      {
        rootMargin: "-155px 0px -55% 0px",
        threshold: [0.05, 0.2, 0.45],
      },
    );

    sections.forEach(({ element }) => observer.observe(element));
    return () => observer.disconnect();
  }, [hotel, roomTypes.length, reviews.length]);

  useEffect(() => {
    if (!galleryOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setGalleryOpen(false);
      if (event.key === "ArrowLeft") {
        setGalleryIndex((current) =>
          current === 0 ? galleryImages.length - 1 : current - 1,
        );
      }
      if (event.key === "ArrowRight") {
        setGalleryIndex((current) =>
          current === galleryImages.length - 1 ? 0 : current + 1,
        );
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  useEffect(() => {
    if (!roomTypeDetail) return undefined;

    function handleRoomTypeDetailKeyDown(event) {
      if (event.key === "Escape") setRoomTypeDetail(null);
      const images = roomTypeImageUrls(roomTypeDetail, galleryImages[1]);
      if (event.key === "ArrowLeft" && images.length > 1) {
        setRoomTypeDetailImageIndex((current) =>
          current === 0 ? images.length - 1 : current - 1,
        );
      }
      if (event.key === "ArrowRight" && images.length > 1) {
        setRoomTypeDetailImageIndex((current) =>
          current === images.length - 1 ? 0 : current + 1,
        );
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleRoomTypeDetailKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleRoomTypeDetailKeyDown);
    };
  }, [roomTypeDetail, galleryImages]);

  useEffect(() => {
    if (!heldRooms.length) return undefined;
    const timer = window.setInterval(() => setHoldClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [heldRooms.length]);

  useEffect(() => {
    if (!hotelId) return undefined;

    return subscribeHotelAvailability(
      hotelId,
      (event) => {
        if (
          !rangesOverlap(
            event?.checkIn,
            event?.checkOut,
            searchForm.checkIn,
            searchForm.checkOut,
          )
        ) {
          return;
        }

        setRealtimeNotice(
          event?.type === "RELEASED"
            ? "Một phòng vừa được mở lại."
            : event?.type === "HELD"
              ? "Có phòng vừa được khách khác giữ tạm thời."
              : "Tình trạng phòng vừa được cập nhật.",
        );
        loadAvailability(searchForm);
        window.setTimeout(() => setRealtimeNotice(""), 3200);
      },
      {
        onConnected: () => setRealtimeConnected(true),
        onError: () => setRealtimeConnected(false),
      },
    );
  }, [
    hotelId,
    loadAvailability,
    searchForm.checkIn,
    searchForm.checkOut,
  ]);

  const roomHoldMap = useMemo(
    () => new Map(
      heldRooms
        .filter((hold) => hold?.roomId && hold?.expiresAt)
        .map((hold) => [String(hold.roomId), hold.expiresAt]),
    ),
    [heldRooms],
  );

  const unavailableSet = useMemo(
    () => new Set(unavailableRoomIds.map(String)),
    [unavailableRoomIds],
  );

  const roomGroups = useMemo(() => {
    return roomTypes.map((type) => {
      const checkInTodayOrEarlier = searchForm.checkIn <= defaultDate(0);
      const availableRooms = rooms.filter((room) => {
        if (String(room.roomTypeId) !== String(type.id)) return false;
        if (unavailableSet.has(String(room.id))) return false;

        // CLEANING/OCCUPIED only describe the room right now. For future
        // stays, booking overlap decides availability. For a same-day stay,
        // the room must already be physically ready.
        if (checkInTodayOrEarlier && room.status !== "AVAILABLE") return false;
        return !["MAINTENANCE", "INACTIVE"].includes(room.status);
      });

      const requestedCapacityFits =
        Number(type.maxAdults ?? 2) * searchForm.rooms >= searchForm.adults &&
        Number(type.maxChildren ?? 0) * searchForm.rooms >=
          searchForm.children;

      const heldForType = rooms
        .filter((room) => String(room.roomTypeId) === String(type.id))
        .map((room) => ({
          roomId: room.id,
          expiresAt: roomHoldMap.get(String(room.id)),
        }))
        .filter((item) => item.expiresAt);
      const nearestHoldExpiresAt = heldForType
        .map((item) => item.expiresAt)
        .sort((first, second) => new Date(first) - new Date(second))[0] ?? null;

      return {
        type,
        availableRooms,
        requestedCapacityFits,
        heldCount: heldForType.length,
        nearestHoldExpiresAt,
      };
    });
  }, [roomTypes, rooms, unavailableSet, roomHoldMap, searchForm]);

  const representativePricingRooms = useMemo(() => {
    return roomGroups
      .map(({ type, availableRooms }) => {
        if (!availableRooms.length) return null;

        const cheapestRoom = [...availableRooms].sort((first, second) => {
          const firstPrice = Number(first.customPrice ?? type.basePrice ?? 0);
          const secondPrice = Number(second.customPrice ?? type.basePrice ?? 0);
          return firstPrice - secondPrice;
        })[0];

        return { room: cheapestRoom, type };
      })
      .filter(Boolean);
  }, [roomGroups]);

  useEffect(() => {
    const roomIds = representativePricingRooms.map((item) => item.room.id);

    if (
      roomIds.length === 0 ||
      !hotelId ||
      !searchForm.checkIn ||
      !searchForm.checkOut ||
      searchForm.checkOut <= searchForm.checkIn
    ) {
      setRoomTypePricing(null);
      setRoomTypePricingLoading(false);
      setRoomTypePricingError("");
      return undefined;
    }

    let active = true;
    setRoomTypePricingLoading(true);
    setRoomTypePricingError("");

    getBookingPricingQuote({
      hotelId,
      roomIds,
      checkIn: searchForm.checkIn,
      checkOut: searchForm.checkOut,
    })
      .then((quote) => {
        if (!active) return;
        setRoomTypePricing(quote);
      })
      .catch((requestError) => {
        if (!active) return;
        setRoomTypePricing(null);
        setRoomTypePricingError(
          requestError?.response?.data?.message ??
            "Chưa thể tải giá theo ngày. Hãy bấm Tìm phòng trống để thử lại.",
        );
      })
      .finally(() => {
        if (active) setRoomTypePricingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    hotelId,
    representativePricingRooms,
    searchForm.checkIn,
    searchForm.checkOut,
  ]);

  const roomTypePriceMap = useMemo(
    () =>
      Object.fromEntries(
        (roomTypePricing?.rooms ?? []).map((room) => [
          String(room.roomTypeId),
          room,
        ]),
      ),
    [roomTypePricing],
  );

  const selectedBooking = useMemo(() => {
    const nights = nightsBetween(searchForm.checkIn, searchForm.checkOut);
    const selections = roomGroups.flatMap(({ type, availableRooms }) => {
      const quantity = Number(selectedQuantities[type.id] ?? 0);
      return availableRooms.slice(0, quantity).map((room) => ({
        room,
        type,
        nightlyPrice: Number(room.customPrice ?? type.basePrice ?? 0),
      }));
    });

    return {
      nights,
      selections,
      totalRooms: selections.length,
      totalPrice: selections.reduce(
        (total, item) => total + item.nightlyPrice * nights,
        0,
      ),
    };
  }, [roomGroups, searchForm.checkIn, searchForm.checkOut, selectedQuantities]);

  useEffect(() => {
    const selectedRoomIds = selectedBooking.selections.map((item) => item.room.id);
    if (selectedRoomIds.length === 0 || !hotelId || !searchForm.checkIn || !searchForm.checkOut) {
      setSelectionPricing(null);
      setSelectionPricingLoading(false);
      return undefined;
    }

    let active = true;
    setSelectionPricingLoading(true);
    getBookingPricingQuote({
      hotelId,
      roomIds: selectedRoomIds,
      checkIn: searchForm.checkIn,
      checkOut: searchForm.checkOut,
    })
      .then((quote) => {
        if (active) setSelectionPricing(quote);
      })
      .catch(() => {
        if (active) setSelectionPricing(null);
      })
      .finally(() => {
        if (active) setSelectionPricingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hotelId, searchForm.checkIn, searchForm.checkOut, selectedBooking]);

  const selectedPriceMap = useMemo(
    () => Object.fromEntries(
      (selectionPricing?.rooms ?? []).map((room) => [String(room.roomId), room]),
    ),
    [selectionPricing],
  );

  const allAmenities = useMemo(() => {
    const values = [
      ...(Array.isArray(hotel?.amenities) ? hotel.amenities : []),
      ...roomTypes.flatMap((type) =>
        Array.isArray(type.amenities) ? type.amenities : [],
      ),
    ];
    return [...new Set(values)];
  }, [hotel, roomTypes]);

  function setSectionRef(id, element) {
    sectionRefs.current[id] = element;
  }

  function scrollToSection(id) {
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function updateGuestValue(field, delta) {
    const minimum = field === "children" ? 0 : 1;
    const maximum = field === "rooms" ? 10 : 20;

    setSearchForm((current) => ({
      ...current,
      [field]: Math.min(
        maximum,
        Math.max(minimum, Number(current[field]) + delta),
      ),
    }));
  }

  function handleSearchSubmit(event) {
    event.preventDefault();

    if (searchForm.checkOut <= searchForm.checkIn) {
      setAvailabilityError("Ngày trả phòng phải sau ngày nhận phòng.");
      return;
    }

    setSelectedQuantities({});
    const params = new URLSearchParams({
      checkIn: searchForm.checkIn,
      checkOut: searchForm.checkOut,
      adults: String(searchForm.adults),
      children: String(searchForm.children),
      rooms: String(searchForm.rooms),
      guests: String(searchForm.adults + searchForm.children),
    });
    navigate(`/hotels/${hotelId}?${params.toString()}`, { replace: true });
    loadAvailability(searchForm);
  }

  async function toggleFavorite() {
    if (!isCustomer) {
      navigate("/login");
      return;
    }

    if (favoriteBusy) return;

    const previous = favorite;
    setFavoriteBusy(true);
    setFavorite(!previous);

    try {
      if (previous) {
        await removeFavoriteHotel(hotelId);
      } else {
        await addFavoriteHotel(hotelId);
      }
    } catch (requestError) {
      setFavorite(previous);
      setError(
        requestError.response?.data?.message
          ?? "Không thể cập nhật danh sách yêu thích.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function shareHotel() {
    const shareData = {
      title: hotel?.name,
      text: `Xem ${hotel?.name} trên EnziuRooms`,
      url: window.location.href,
    };

    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
      return;
    }

    await navigator.clipboard?.writeText(window.location.href);
  }

  function handleProceedBooking() {
    if (selectedBooking.totalRooms === 0) return;

    const params = new URLSearchParams({
      hotelId,
      roomIds: selectedBooking.selections
        .map((item) => item.room.id)
        .join(","),
      checkIn: searchForm.checkIn,
      checkOut: searchForm.checkOut,
      adults: String(searchForm.adults),
      children: String(searchForm.children),
      guests: String(searchForm.adults + searchForm.children),
      rooms: String(selectedBooking.totalRooms),
    });

    const target = `/customer/checkout?${params.toString()}`;
    if (!isAuthenticated) {
      localStorage.setItem("enziuroomsPendingBookingUrl", target);
      navigate("/login");
      return;
    }

    navigate(target);
  }

  if (loading) {
    return <Loading message="Đang tải chi tiết khách sạn..." />;
  }

  if (!hotel) {
    return (
      <main className="container customer-detail-page">
        <ErrorMessage message={error || "Không tìm thấy khách sạn."} />
      </main>
    );
  }

  const tabs = [
    ["overview", "Tổng quan"],
    ["rooms", "Thông tin & giá"],
    ["amenities", "Tiện nghi"],
    ["rules", "Quy tắc chung"],
    [
      "reviews",
      `Đánh giá của khách (${Number(reviewSummary.reviewCount ?? 0)})`,
    ],
  ];

  return (
    <main className="hotel-detail-v2">
      <nav className="hotel-detail-tabs" aria-label="Điều hướng chi tiết">
        <div className="container">
          {tabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={activeSection === id ? "active" : ""}
              onClick={() => {
                if (id === "reviews") {
                  setReviewModalOpen(true);
                  return;
                }
                scrollToSection(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="container hotel-detail-shell">
        <Link to="/hotels" className="customer-back-link">
          <ArrowLeft size={17} />
          Quay lại kết quả tìm kiếm
        </Link>

        <ErrorMessage message={error} />

        <section
          ref={(element) => setSectionRef("overview", element)}
          data-section="overview"
          className="hotel-overview-section detail-scroll-section"
        >
          <header className="hotel-detail-title-row">
            <div className="hotel-title-copy">
              <div className="customer-hotel-stars">
                {Array.from({ length: Number(hotel.starRating ?? 0) }).map(
                  (_, index) => (
                    <Star key={index} size={18} fill="currentColor" />
                  ),
                )}
              </div>
              <h1>{hotel.name}</h1>
              <p>
                <MapPin size={18} />
                {[hotel.address, hotel.ward, hotel.district, hotel.city]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>

            <div className="hotel-title-actions">
              <div className="hotel-real-rating">
                <div>
                  <strong>{ratingLabel(reviewSummary.averageRating)}</strong>
                  <small>
                    {reviewSummary.reviewCount > 0
                      ? `${reviewSummary.reviewCount} đánh giá thật`
                      : "Chưa có khách hàng đánh giá"}
                  </small>
                </div>
                {reviewSummary.averageRating != null ? (
                  <span>{Number(reviewSummary.averageRating).toFixed(1)}</span>
                ) : null}
              </div>

              <div className="hotel-action-buttons">
                <button
                  type="button"
                  className={`hotel-icon-action ${favorite ? "active" : ""}`}
                  onClick={toggleFavorite}
                  disabled={favoriteBusy}
                  aria-label={favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                  title={favorite ? "Bỏ khỏi yêu thích" : "Thêm vào yêu thích"}
                >
                  <Heart size={22} fill={favorite ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  className="hotel-icon-action"
                  onClick={shareHotel}
                  aria-label="Chia sẻ khách sạn"
                >
                  <Share2 size={21} />
                </button>
                {isCustomer ? (
                  <button
                    type="button"
                    className="hotel-ai-action"
                    onClick={() =>
                      openAssistant({
                        hotelId: hotel.id,
                        hotelName: hotel.name,
                        checkIn: searchForm.checkIn,
                        checkOut: searchForm.checkOut,
                        adults: searchForm.adults,
                        children: searchForm.children,
                        openTrip: true,
                      })
                    }
                    title="Hỏi Enziu AI về khách sạn này"
                  >
                    <Bot size={18} />
                    Hỏi AI
                  </button>
                ) : (
                  <Link
                    className="hotel-ai-action"
                    to="/login"
                    title="Đăng nhập để hỏi Enziu AI"
                  >
                    <Bot size={18} />
                    Hỏi AI
                  </Link>
                )}
                <button
                  type="button"
                  className="hotel-book-now"
                  onClick={() => scrollToSection("rooms")}
                >
                  Đặt ngay
                </button>
              </div>
            </div>
          </header>

          <div className="hotel-gallery-v2">
            <button
              type="button"
              className="hotel-gallery-main"
              onClick={() => {
                setGalleryIndex(0);
                setGalleryOpen(true);
              }}
            >
              <img src={galleryImages[0]} alt={hotel.name} />
            </button>

            <div className="hotel-gallery-side">
              {[1, 2].map((index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => {
                    setGalleryIndex(index % galleryImages.length);
                    setGalleryOpen(true);
                  }}
                >
                  <img
                    src={galleryImages[index % galleryImages.length]}
                    alt={`Không gian ${hotel.name} ${index + 1}`}
                  />
                </button>
              ))}
            </div>

            <div className="hotel-gallery-thumbs">
              {[3, 4, 5, 6, 7].map((sourceIndex, itemIndex) => {
                const imageIndex = sourceIndex % galleryImages.length;
                const isLast = itemIndex === 4;
                return (
                  <button
                    type="button"
                    key={`${sourceIndex}-${galleryImages[imageIndex]}`}
                    onClick={() => {
                      setGalleryIndex(imageIndex);
                      setGalleryOpen(true);
                    }}
                  >
                    <img
                      src={galleryImages[imageIndex]}
                      alt={`Ảnh khách sạn ${sourceIndex + 1}`}
                    />
                    {isLast ? (
                      <span>
                        <Images size={18} />
                        Xem {galleryImages.length} ảnh
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hotel-overview-grid">
            <article className="hotel-info-card">
              <h2>Giới thiệu khách sạn</h2>
              <p>
                {hotel.description ||
                  "Khách sạn mang đến không gian lưu trú tiện nghi, phù hợp cho chuyến công tác và kỳ nghỉ của bạn."}
              </p>
              <div className="hotel-highlight-list">
                {(allAmenities.length > 0
                  ? allAmenities.slice(0, 8)
                  : ["WiFi miễn phí", "Điều hòa", "Đã được kiểm duyệt"]
                ).map((amenity) => (
                  <span key={amenity}>
                    {amenityIcon(amenity)}
                    {amenity}
                  </span>
                ))}
              </div>
            </article>

            <aside className="hotel-search-summary-card">
              <h3>Thông tin tìm kiếm</h3>
              <div>
                <CalendarDays size={19} />
                <span>
                  <small>Nhận phòng</small>
                  <strong>{formatDate(searchForm.checkIn)}</strong>
                </span>
              </div>
              <div>
                <CalendarDays size={19} />
                <span>
                  <small>Trả phòng</small>
                  <strong>{formatDate(searchForm.checkOut)}</strong>
                </span>
              </div>
              <div>
                <Users size={19} />
                <span>
                  <small>Số khách và phòng</small>
                  <strong>
                    {searchForm.adults} người lớn · {searchForm.children} trẻ em ·{" "}
                    {searchForm.rooms} phòng
                  </strong>
                </span>
              </div>
            </aside>
          </div>
        </section>

        <section
          ref={(element) => setSectionRef("rooms", element)}
          data-section="rooms"
          className="hotel-rooms-v2 detail-scroll-section"
        >
          <div className="hotel-section-heading">
            <span>PHÒNG TRỐNG</span>
            <h2>Chọn phòng phù hợp</h2>
            <p>Giá và số lượng phòng được tính theo ngày bạn chọn.</p>
          </div>

          <form className="hotel-availability-bar" onSubmit={handleSearchSubmit}>
            <label>
              <span>Nhận phòng</span>
              <div>
                <CalendarDays size={19} />
                <input
                  type="date"
                  value={searchForm.checkIn}
                  min={defaultDate(0)}
                  onChange={(event) =>
                    setSearchForm((current) => ({
                      ...current,
                      checkIn: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </label>

            <label>
              <span>Trả phòng</span>
              <div>
                <CalendarDays size={19} />
                <input
                  type="date"
                  value={searchForm.checkOut}
                  min={searchForm.checkIn || defaultDate(1)}
                  onChange={(event) =>
                    setSearchForm((current) => ({
                      ...current,
                      checkOut: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </label>

            <div className="hotel-guest-picker-wrap" ref={guestPickerRef}>
              <span>Khách và phòng</span>
              <button
                type="button"
                className="hotel-guest-trigger"
                onClick={() => setGuestPickerOpen((current) => !current)}
              >
                <Users size={19} />
                <strong>
                  {searchForm.adults} người lớn · {searchForm.children} trẻ em ·{" "}
                  {searchForm.rooms} phòng
                </strong>
                <ChevronDown size={18} />
              </button>

              {guestPickerOpen ? (
                <div className="hotel-guest-popover">
                  {[
                    ["adults", "Người lớn", "Từ 18 tuổi"],
                    ["children", "Trẻ em", "0–17 tuổi"],
                    ["rooms", "Phòng", "Số phòng cần đặt"],
                  ].map(([field, title, subtitle]) => (
                    <div className="hotel-counter-row" key={field}>
                      <div>
                        <strong>{title}</strong>
                        <small>{subtitle}</small>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => updateGuestValue(field, -1)}
                          aria-label={`Giảm ${title}`}
                        >
                          <Minus size={16} />
                        </button>
                        <span>{searchForm[field]}</span>
                        <button
                          type="button"
                          onClick={() => updateGuestValue(field, 1)}
                          aria-label={`Tăng ${title}`}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <button type="submit" disabled={availabilityLoading}>
              {availabilityLoading ? "Đang kiểm tra..." : "Tìm phòng trống"}
            </button>
          </form>

          <div className={`hotel-realtime-inventory ${realtimeConnected ? "online" : "reconnecting"}`}>
            <span className="hotel-realtime-dot" />
            <span>
              {realtimeConnected
                ? "Kho phòng đang đồng bộ theo thời gian thực"
                : "Đang kết nối lại cập nhật phòng thời gian thực"}
            </span>
            {realtimeNotice ? <strong>{realtimeNotice}</strong> : null}
          </div>

          {availabilityError ? (
            <div className="hotel-inline-error">{availabilityError}</div>
          ) : null}

          {roomTypePricingError ? (
            <div className="hotel-inline-error">{roomTypePricingError}</div>
          ) : null}

          <div className="hotel-room-table-layout">
            <div className="hotel-room-table">
              <div className="hotel-room-table-header">
                <span>Loại phòng</span>
                <span>Số lượng khách</span>
                <span>Giá cho {selectedBooking.nights} đêm</span>
                <span>Các lựa chọn</span>
                <span>Chọn phòng</span>
              </div>

              {roomGroups.length === 0 ? (
                <div className="customer-empty-results">
                  <BedDouble size={42} />
                  <h2>Khách sạn chưa tạo loại phòng</h2>
                  <p>Vui lòng quay lại kiểm tra sau.</p>
                </div>
              ) : (
                roomGroups.map(({
                  type,
                  availableRooms,
                  requestedCapacityFits,
                  heldCount,
                  nearestHoldExpiresAt,
                }) => {
                  const maxSelectable = Math.min(availableRooms.length, 10);
                  const roomImage =
                    type.coverImageUrl || type.images?.[0]?.url || galleryImages[1];
                  const typeQuote = roomTypePriceMap[String(type.id)] ?? null;
                  const baseStayAmount = Number(
                    typeQuote?.baseAmount ??
                      Number(type.basePrice ?? 0) * selectedBooking.nights,
                  );
                  const finalStayAmount = Number(
                    typeQuote?.totalAmount ?? baseStayAmount,
                  );
                  const weekendSurchargeAmount = Number(
                    typeQuote?.weekendSurchargeAmount ?? 0,
                  );
                  const specialDateSurchargeAmount = Number(
                    typeQuote?.specialDateSurchargeAmount ?? 0,
                  );
                  const hasDynamicSurcharge =
                    weekendSurchargeAmount > 0 || specialDateSurchargeAmount > 0;

                  return (
                    <article className="hotel-room-row" key={type.id}>
                      <div className="hotel-room-type-cell">
                        <button
                          type="button"
                          className="hotel-room-type-image-button"
                          onClick={() => {
                            setRoomTypeDetail(type);
                            setRoomTypeDetailImageIndex(0);
                          }}
                          aria-label={`Xem chi tiết ${type.name}`}
                        >
                          <img src={roomImage} alt={type.name} />
                        </button>
                        <div>
                          <button
                            type="button"
                            className="hotel-room-type-title-button"
                            onClick={() => {
                              setRoomTypeDetail(type);
                              setRoomTypeDetailImageIndex(0);
                            }}
                          >
                            {type.name}
                          </button>
                          <p>
                            {type.bedCount ?? 1} {type.bedType || "giường"}
                            {type.areaSqm ? ` · ${type.areaSqm} m²` : ""}
                          </p>
                          <div className="hotel-room-tags">
                            {(type.amenities ?? []).slice(0, 6).map((amenity) => (
                              <span key={amenity}>{amenity}</span>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="hotel-room-type-detail-hint"
                            onClick={() => {
                              setRoomTypeDetail(type);
                              setRoomTypeDetailImageIndex(0);
                            }}
                          >
                            Xem chi tiết loại phòng
                          </button>
                        </div>
                      </div>

                      <div className="hotel-room-capacity-cell">
                        <span>
                          <Users size={18} />
                          Tối đa {type.maxAdults ?? 2} người lớn
                        </span>
                        <span>
                          <Baby size={18} />
                          {type.maxChildren ?? 0} trẻ em
                        </span>
                        {!requestedCapacityFits ? (
                          <small>Không đủ sức chứa cho tìm kiếm này</small>
                        ) : null}
                      </div>

                      <div className="hotel-room-price-cell">
                        <strong className={hasDynamicSurcharge ? "dynamic" : ""}>
                          {roomTypePricingLoading && !typeQuote && availableRooms.length > 0
                            ? "Đang tính giá..."
                            : formatMoney(finalStayAmount)}
                        </strong>

                        {typeQuote ? (
                          <div className="hotel-room-dynamic-pricing">
                            {hasDynamicSurcharge ? (
                              <small className="hotel-room-base-price">
                                Giá gốc: {formatMoney(baseStayAmount)}
                              </small>
                            ) : (
                              <small className="hotel-room-normal-price">Giá ngày thường</small>
                            )}

                            {weekendSurchargeAmount > 0 ? (
                              <span className="weekend">
                                Cuối tuần +10% · +{formatMoney(weekendSurchargeAmount)}
                              </span>
                            ) : null}

                            {specialDateSurchargeAmount > 0 ? (
                              <span className="special">
                                Ngày đặc biệt +20% · +{formatMoney(specialDateSurchargeAmount)}
                              </span>
                            ) : null}

                            {Array.isArray(typeQuote.nights) && typeQuote.nights.length > 1 ? (
                              <small className="hotel-room-night-summary">
                                {typeQuote.nights.map((night) => night.pricingLabel).join(" · ")}
                              </small>
                            ) : null}
                          </div>
                        ) : (
                          <small>
                            Giá cơ bản · Cuối tuần/ngày đặc biệt được backend tính theo ngày
                          </small>
                        )}
                        {availableRooms.length > 0 ? (
                          <em>
                            Còn {availableRooms.length} phòng trống theo ngày đã chọn
                          </em>
                        ) : (
                          <em className="sold-out">Đã hết phòng</em>
                        )}
                        {heldCount > 0 && nearestHoldExpiresAt ? (
                          <em className="hotel-room-live-hold">
                            🔒 {heldCount} phòng đang được giữ · còn {holdCountdown(
                              nearestHoldExpiresAt,
                              holdClockMs,
                            )}
                          </em>
                        ) : null}
                      </div>

                      <div className="hotel-room-options-cell">
                        <span>
                          <Check size={18} />
                          {type.breakfastIncluded
                            ? "Bao gồm bữa sáng"
                            : "Không bao gồm bữa sáng"}
                        </span>
                        <span>
                          <Check size={18} />
                          {type.refundable
                            ? "Có thể hoàn tiền theo chính sách"
                            : "Không hoàn tiền"}
                        </span>
                        <span>
                          <WalletCards size={18} />
                          {[
                            type.payAtHotelAllowed !== false
                              ? "Trả tại khách sạn"
                              : null,
                            type.depositAllowed !== false
                              ? `Cọc ${type.depositPercent ?? 30}%`
                              : null,
                            type.fullPaymentAllowed !== false
                              ? "Trả toàn bộ"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span>
                          {type.smokingAllowed ? <Check size={18} /> : <Ban size={18} />}
                          {type.smokingAllowed
                            ? "Cho phép hút thuốc"
                            : "Không hút thuốc"}
                        </span>
                      </div>

                      <div className="hotel-room-select-cell">
                        <select
                          value={selectedQuantities[type.id] ?? 0}
                          disabled={
                            maxSelectable === 0 ||
                            !requestedCapacityFits ||
                            availabilityLoading
                          }
                          onChange={(event) =>
                            setSelectedQuantities((current) => ({
                              ...current,
                              [type.id]: Number(event.target.value),
                            }))
                          }
                          aria-label={`Chọn số lượng ${type.name}`}
                        >
                          {Array.from({ length: maxSelectable + 1 }).map((_, index) => (
                            <option key={index} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <aside className="hotel-selection-summary">
              <h3>Lựa chọn của bạn</h3>
              {selectedBooking.totalRooms === 0 ? (
                <div className="hotel-selection-empty">
                  <BedDouble size={34} />
                  <p>Chọn số lượng phòng ở bảng bên trái.</p>
                </div>
              ) : (
                <>
                  <div className="hotel-selection-items">
                    {selectedBooking.selections.map((item) => {
                      const quoted = selectedPriceMap[String(item.room.id)];
                      return (
                        <div key={item.room.id}>
                          <span>{item.type.name}<small>Phòng {item.room.roomNumber}</small></span>
                          <strong>{formatMoney(quoted?.totalAmount ?? item.nightlyPrice * selectedBooking.nights)}</strong>
                        </div>
                      );
                    })}
                  </div>
                  {selectionPricingLoading ? (
                    <div className="hotel-selection-pricing-note">Đang tính giá theo từng ngày...</div>
                  ) : selectionPricing ? (
                    <div className="hotel-selection-pricing-note">
                      <span>Giá thường: {formatMoney(selectionPricing.baseAmount)}</span>
                      {Number(selectionPricing.weekendSurchargeAmount ?? 0) > 0 ? (
                        <span>Cuối tuần +10%: +{formatMoney(selectionPricing.weekendSurchargeAmount)}</span>
                      ) : null}
                      {Number(selectionPricing.specialDateSurchargeAmount ?? 0) > 0 ? (
                        <span>Ngày đặc biệt: +{formatMoney(selectionPricing.specialDateSurchargeAmount)}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="hotel-selection-total">
                    <span>
                      {selectedBooking.totalRooms} phòng · {selectedBooking.nights} đêm
                    </span>
                    <strong>{formatMoney(selectionPricing?.totalAmount ?? selectedBooking.totalPrice)}</strong>
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={selectedBooking.totalRooms === 0 || selectionPricingLoading}
                onClick={handleProceedBooking}
              >
                Tôi sẽ đặt
              </button>
              <p>Bạn chưa bị trừ tiền ở bước này.</p>
            </aside>
          </div>
        </section>

        <section
          ref={(element) => setSectionRef("amenities", element)}
          data-section="amenities"
          className="hotel-content-section detail-scroll-section"
        >
          <div className="hotel-section-heading">
            <span>TIỆN NGHI</span>
            <h2>Tiện nghi được khách hàng quan tâm</h2>
          </div>
          <div className="hotel-amenities-grid-v2">
            {(allAmenities.length > 0
              ? allAmenities
              : [
                  "WiFi miễn phí",
                  "Máy điều hòa",
                  "Phòng tắm riêng",
                  "Dọn phòng hằng ngày",
                ]
            ).map((amenity) => (
              <div key={amenity}>
                {amenityIcon(amenity)}
                <span>{amenity}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          ref={(element) => setSectionRef("rules", element)}
          data-section="rules"
          className="hotel-content-section detail-scroll-section"
        >
          <div className="hotel-section-heading">
            <span>QUY TẮC CHUNG</span>
            <h2>Thông tin quan trọng trước khi đặt</h2>
          </div>
          <div className="hotel-rules-grid">
            <article>
              <Clock3 size={23} />
              <div>
                <h3>Nhận và trả phòng</h3>
                <p>
                  Nhận phòng từ {formatTime(hotel.checkInTime, "14:00")} · Trả phòng trước{" "}
                  {formatTime(hotel.checkOutTime, "12:00")}
                </p>
              </div>
            </article>
            <article>
              <ShieldCheck size={23} />
              <div>
                <h3>Hoàn tiền</h3>
                <p>
                  Chính sách phụ thuộc từng loại phòng. Kiểm tra mục “Các lựa chọn” trước khi đặt.
                </p>
              </div>
            </article>
            <article>
              <Ban size={23} />
              <div>
                <h3>Hút thuốc</h3>
                <p>
                  Quy định hút thuốc được hiển thị riêng trên từng loại phòng.
                </p>
              </div>
            </article>
            <article>
              <Users size={23} />
              <div>
                <h3>Trẻ em và giường phụ</h3>
                <p>
                  Sức chứa tối đa được tính theo thông tin mà khách sạn khai báo cho từng loại phòng.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          ref={(element) => setSectionRef("reviews", element)}
          data-section="reviews"
          className="hotel-content-section detail-scroll-section hotel-review-teaser-section"
        >
          <div className="hotel-section-heading hotel-review-teaser-heading">
            <div>
              <span>ĐÁNH GIÁ CỦA KHÁCH HÀNG</span>
              <h2>Khách đã lưu trú nói gì?</h2>
              <p>
                Điểm và nhận xét chỉ đến từ các booking đã hoàn tất trên EnziuRooms.
              </p>
            </div>

            {reviewSummary.reviewCount > 0 ? (
              <button
                type="button"
                className="hotel-open-reviews-button"
                onClick={() => setReviewModalOpen(true)}
              >
                Xem tất cả {reviewSummary.reviewCount} đánh giá
              </button>
            ) : null}
          </div>

          {reviewSummary.reviewCount === 0 ? (
            <div className="hotel-no-reviews">
              <Star size={40} />
              <h3>Khách sạn chưa có đánh giá</h3>
              <p>
                Điểm số sẽ xuất hiện sau khi khách hoàn thành chuyến đi và gửi đánh giá.
              </p>
            </div>
          ) : (
            <div className="hotel-review-teaser">
              <aside className="hotel-review-score-card">
                <strong>{Number(reviewSummary.averageRating).toFixed(1)}</strong>
                <h3>{ratingLabel(reviewSummary.averageRating)}</h3>
                <p>{reviewSummary.reviewCount} đánh giá thật</p>
              </aside>

              <div className="hotel-review-category-preview">
                {[
                  ["staff", "Nhân viên phục vụ"],
                  ["facilities", "Tiện nghi"],
                  ["cleanliness", "Sạch sẽ"],
                  ["comfort", "Thoải mái"],
                  ["value", "Đáng giá tiền"],
                  ["location", "Địa điểm"],
                ].map(([key, label]) => {
                  const value = reviewSummary.categoryAverages?.[key];
                  if (value == null) return null;

                  return (
                    <div key={key}>
                      <span>
                        {label}
                        <strong>{Number(value).toFixed(1)}</strong>
                      </span>
                      <i>
                        <b style={{ width: `${Number(value) * 10}%` }} />
                      </i>
                    </div>
                  );
                })}
              </div>

              <div className="hotel-review-mini-list">
                {reviews.slice(0, 2).map((review) => (
                  <article key={review.id}>
                    <div className="hotel-review-avatar">
                      <span>
                        {String(review.customerName ?? "K").charAt(0).toUpperCase()}
                      </span>
                      {review.customerAvatarUrl ? (
                        <img
                          src={review.customerAvatarUrl}
                          alt={review.customerName ?? "Ảnh đại diện khách hàng"}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>
                    <div>
                      <header>
                        <strong>{review.customerName}</strong>
                        <span>{Number(review.rating).toFixed(1)}</span>
                      </header>
                      <h4>{review.title || ratingLabel(review.rating)}</h4>
                      <p>{review.positiveComment ?? review.comment}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {roomTypeDetail ? (() => {
        const images = roomTypeImageUrls(roomTypeDetail, galleryImages[1]);
        const safeIndex = Math.min(roomTypeDetailImageIndex, Math.max(images.length - 1, 0));
        const selectedImage = images[safeIndex] ?? galleryImages[1];
        return (
          <div
            className="hotel-room-type-detail-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết loại phòng ${roomTypeDetail.name}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRoomTypeDetail(null);
            }}
          >
            <div className="hotel-room-type-detail-modal">
              <button
                type="button"
                className="hotel-room-type-detail-close"
                onClick={() => setRoomTypeDetail(null)}
                aria-label="Đóng chi tiết loại phòng"
              >
                <X size={22} />
              </button>

              <div className="hotel-room-type-detail-gallery">
                <div className="hotel-room-type-detail-main-image">
                  <img src={selectedImage} alt={roomTypeDetail.name} />
                  {images.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="previous"
                        onClick={() =>
                          setRoomTypeDetailImageIndex((current) =>
                            current === 0 ? images.length - 1 : current - 1,
                          )
                        }
                        aria-label="Ảnh trước"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        type="button"
                        className="next"
                        onClick={() =>
                          setRoomTypeDetailImageIndex((current) =>
                            current === images.length - 1 ? 0 : current + 1,
                          )
                        }
                        aria-label="Ảnh sau"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  ) : null}
                </div>
                {images.length > 1 ? (
                  <div className="hotel-room-type-detail-thumbs">
                    {images.map((image, index) => (
                      <button
                        type="button"
                        key={`${image}-${index}`}
                        className={index === safeIndex ? "active" : ""}
                        onClick={() => setRoomTypeDetailImageIndex(index)}
                      >
                        <img src={image} alt={`Ảnh ${index + 1} của ${roomTypeDetail.name}`} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="hotel-room-type-detail-copy">
                <span className="hotel-room-type-detail-kicker">CHI TIẾT LOẠI PHÒNG</span>
                <h2>{roomTypeDetail.name}</h2>
                <strong className="hotel-room-type-detail-price">
                  {formatMoney(Number(roomTypeDetail.basePrice ?? 0))} / đêm
                </strong>
                <p className="hotel-room-type-detail-description">
                  {roomTypeDetail.description || "Khách sạn chưa cập nhật mô tả chi tiết cho loại phòng này."}
                </p>

                <div className="hotel-room-type-detail-facts">
                  <span><Users size={17} /> Tối đa {roomTypeDetail.maxAdults ?? 2} người lớn</span>
                  <span><Baby size={17} /> {roomTypeDetail.maxChildren ?? 0} trẻ em</span>
                  <span><BedDouble size={17} /> {roomTypeDetail.bedCount ?? 1} {roomTypeDetail.bedType || "giường"}</span>
                  {roomTypeDetail.areaSqm ? <span><Bath size={17} /> {roomTypeDetail.areaSqm} m²</span> : null}
                </div>

                <div className="hotel-room-type-detail-policies">
                  <span><Check size={17} /> {roomTypeDetail.breakfastIncluded ? "Bao gồm bữa sáng" : "Không bao gồm bữa sáng"}</span>
                  <span><Check size={17} /> {roomTypeDetail.refundable ? "Có thể hoàn tiền theo chính sách" : "Không hoàn tiền"}</span>
                  <span><WalletCards size={17} /> {roomTypeDetail.payAtHotelAllowed !== false ? "Có thể trả tại khách sạn" : "Thanh toán online"}</span>
                  <span>{roomTypeDetail.smokingAllowed ? <Check size={17} /> : <Ban size={17} />} {roomTypeDetail.smokingAllowed ? "Cho phép hút thuốc" : "Không hút thuốc"}</span>
                </div>

                <div className="hotel-room-type-detail-amenities">
                  <h3>Tiện nghi trong phòng</h3>
                  <div>
                    {(roomTypeDetail.amenities ?? []).length ? (roomTypeDetail.amenities ?? []).map((amenity) => (
                      <span key={amenity}><Check size={15} /> {amenity}</span>
                    )) : <p>Chưa có tiện nghi được cập nhật.</p>}
                  </div>
                </div>

                <button
                  type="button"
                  className="hotel-room-type-detail-select"
                  onClick={() => {
                    setRoomTypeDetail(null);
                    document.querySelector(`[aria-label="Chọn số lượng ${roomTypeDetail.name}"]`)?.focus();
                  }}
                >
                  Chọn số lượng phòng
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

      {galleryOpen ? (
        <div
          className="hotel-gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Bộ ảnh ${hotel.name}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setGalleryOpen(false);
          }}
        >
          <button
            type="button"
            className="hotel-gallery-close"
            onClick={() => setGalleryOpen(false)}
            aria-label="Đóng bộ ảnh"
          >
            <X size={24} />
          </button>
          <button
            type="button"
            className="hotel-gallery-arrow previous"
            onClick={() =>
              setGalleryIndex((current) =>
                current === 0 ? galleryImages.length - 1 : current - 1,
              )
            }
            aria-label="Ảnh trước"
          >
            <ChevronLeft size={30} />
          </button>
          <div className="hotel-gallery-modal-content">
            <img src={galleryImages[galleryIndex]} alt={`${hotel.name} ${galleryIndex + 1}`} />
            <span>
              {galleryIndex + 1}/{galleryImages.length}
            </span>
            <div>
              {galleryImages.map((image, index) => (
                <button
                  type="button"
                  className={index === galleryIndex ? "active" : ""}
                  key={`${image}-${index}`}
                  onClick={() => setGalleryIndex(index)}
                >
                  <img src={image} alt={`Ảnh thu nhỏ ${index + 1}`} />
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="hotel-gallery-arrow next"
            onClick={() =>
              setGalleryIndex((current) =>
                current === galleryImages.length - 1 ? 0 : current + 1,
              )
            }
            aria-label="Ảnh sau"
          >
            <ChevronRight size={30} />
          </button>
        </div>
      ) : null}

      {reviewModalOpen ? (
        <ReviewExplorerModal
          hotel={hotel}
          roomTypes={roomTypes}
          reviews={reviews}
          summary={reviewSummary}
          onClose={() => setReviewModalOpen(false)}
        />
      ) : null}
    </main>
  );
}