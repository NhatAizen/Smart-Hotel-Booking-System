import {
  ArrowRightLeft,
  ArrowUpDown,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Eye,
  Hotel,
  ImageOff,
  LifeBuoy,
  MapPin,
  MessageCircle,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useFloatingChat } from "../../chat/FloatingChatContext";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  ConfirmDialog,
  EmptyState,
  Pagination,
  StatusBadge,
} from "../../components/ui";
import ReviewFormModal from "../../components/review/ReviewFormModal";
import BookingTermsPanel from "../../components/booking/BookingTermsPanel";
import ComplaintCreateModal from "../../components/complaint/ComplaintCreateModal";
import {
  cancelBooking,
  createRoomChangeRequest,
  getBookingQrBlob,
  getHotelAvailability,
  getMyBookings,
  getMyRoomChangeRequests,
  getMyReviews,
  hideBookingFromCustomer,
} from "../../services/bookingService";
import {
  getHotelById,
  getRoomById,
  getRoomsByHotel,
  getRoomTypeById,
  getRoomTypesByHotel,
} from "../../services/hotelService";
import {
  createPayOsCheckout,
  createRefundRequest,
  getMyRefundRequests,
  getRefundHotelProof,
} from "../../services/paymentService";
import { getMyComplaints } from "../../services/complaintService";
import { scrollToHashTarget } from "../../utils/notificationNavigation";
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";
import "./CustomerAccountExperience.css";
import "./BookingsPage.css";

const PAGE_SIZE = 6;

const FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "PAYMENT", label: "Chờ thanh toán" },
  { value: "UPCOMING", label: "Sắp tới" },
  { value: "STAYING", label: "Đang lưu trú" },
  { value: "COMPLETED", label: "Đã hoàn tất" },
  { value: "CANCELLED", label: "Đã hủy" },
];

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function formatDate(value) {
  if (!value) return "--";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value, fallback) {
  if (!value) return fallback;
  return String(value).slice(0, 5);
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function paymentOptionLabel(value, depositPercent) {
  if (value === "PAY_AT_HOTEL") return "Thanh toán tại khách sạn";
  if (value === "DEPOSIT") {
    return depositPercent == null ? "Đặt cọc" : `Đặt cọc ${depositPercent}%`;
  }
  if (value === "FULL_PAYMENT") return "Thanh toán toàn bộ";
  return "Chưa xác định";
}

function statusLabel(value) {
  const normalized = normalizeEnum(value);
  if (normalized === "PENDING") return "Chờ xác nhận";
  if (normalized === "NO_SHOW") return "Không đến nhận phòng";
  return STATUS_LABELS[normalized] ?? "Chưa xác định";
}

function paymentStatusLabel(value, booking = null) {
  if (value === "PARTIALLY_PAID") {
    // Chỉ gọi là "Đã đặt cọc" khi booking thực sự chọn hình thức đặt cọc.
    if (booking?.paymentOption === "DEPOSIT") {
      return booking.depositPercent == null
        ? "Đã đặt cọc"
        : `Đã đặt cọc ${booking.depositPercent}%`;
    }

    // Các khoản còn thiếu phát sinh sau đó (ví dụ trả phòng trễ/ở thêm)
    // không được hiển thị nhầm thành "Đã đặt cọc".
    if (Number(booking?.remainingAmount ?? 0) > 0) {
      return "Chờ thanh toán phí phát sinh";
    }

    return "Đã thanh toán một phần";
  }

  return (
    {
      UNPAID: "Chưa thanh toán",
      PAID: "Đã thanh toán đủ",
      FAILED: "Thanh toán thất bại",
      REFUNDED: "Đã hoàn tiền",
    }[normalizeEnum(value)] ?? "Chưa xác định"
  );
}

function hotelCover(hotel) {
  return hotel?.coverImageUrl
    ?? hotel?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.url
    ?? "";
}

function resolveMediaUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.imageUrl
    ?? image.url
    ?? image.fileUrl
    ?? image.publicUrl
    ?? image.path
    ?? "";
}

function roomTypeCover(roomType) {
  if (!roomType) return "";
  if (roomType.coverImageUrl) return roomType.coverImageUrl;
  if (roomType.imageUrl) return roomType.imageUrl;
  const images = Array.isArray(roomType.images) ? roomType.images : [];
  const preferred = images.find((image) => image?.cover || image?.isCover || image?.primary) ?? images[0];
  return resolveMediaUrl(preferred);
}

function roomTypeImageUrls(roomType) {
  if (!roomType) return [];
  const images = Array.isArray(roomType.images) ? roomType.images : [];
  const values = [roomType.coverImageUrl, roomType.imageUrl, ...images.map(resolveMediaUrl)]
    .map(resolveMediaUrl)
    .filter(Boolean);
  return [...new Set(values)];
}

function bedSummary(roomType) {
  if (!roomType) return "";
  const count = Number(roomType.bedCount ?? 0);
  const type = String(roomType.bedType ?? "").trim();
  if (!count && !type) return "";
  if (count && type) return `${count} ${type}`;
  return count ? `${count} giường` : type;
}

function bookingMatchesFilter(booking, filter) {
  if (filter === "ALL") return true;

  if (filter === "PAYMENT") {
    return Number(booking.remainingAmount ?? 0) > 0
      && !["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(booking.status);
  }

  if (filter === "UPCOMING") {
    return ["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(booking.status);
  }

  if (filter === "STAYING") return booking.status === "CHECKED_IN";
  if (filter === "COMPLETED") return booking.status === "CHECKED_OUT";
  if (filter === "CANCELLED") return ["CANCELLED", "NO_SHOW"].includes(booking.status);
  return true;
}

function canHideBooking(booking) {
  return ["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(booking.status);
}

function canCancelBooking(booking) {
  return !["CANCELLED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"].includes(booking.status);
}

function canChatWithHotel(booking) {
  return ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"].includes(booking.status);
}

function canContinuePayment(booking) {
  return booking.paymentOption !== "PAY_AT_HOTEL"
    && Number(booking.remainingAmount ?? 0) > 0
    && ["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)
    && booking.paymentStatus !== "PAID";
}

function canRequestRefund(booking) {
  if (Number(booking?.paidAmount ?? 0) <= 0 || booking?.paymentStatus === "REFUNDED") return false;

  // Không cho khách tự yêu cầu hoàn chỉ vì đã tới ngày check-in.
  // Hotel Admin phải xác nhận NO_SHOW (sau grace period) hoặc booking đã CANCELLED.
  // Nhờ vậy UI không tạo cảm giác NO_SHOW = tự động được hoàn tiền.
  return ["NO_SHOW", "CANCELLED"].includes(booking?.status);
}

function refundStatusLabel(value) {
  return ({
    PENDING_HOTEL_REVIEW: "Chờ khách sạn duyệt",
    APPROVED: "Đã duyệt - chờ hoàn",
    PARTIALLY_COMPLETED: "Đã hoàn một phần",
    COMPLETED: "Đã hoàn tất",
    REJECTED: "Bị từ chối",
  }[normalizeEnum(value)] ?? "Chưa xác định");
}

function roomChangeStatusLabel(value) {
  return ({
    PENDING: "Đang chờ khách sạn",
    APPROVED: "Đã duyệt đổi phòng",
    REJECTED: "Khách sạn đã từ chối",
  })[normalizeEnum(value)] ?? "Chưa xác định";
}

function canRequestRoomChange(booking) {
  if (!booking || booking.status !== "CONFIRMED") return false;
  if (!booking.checkIn) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkIn = new Date(`${booking.checkIn}T00:00:00`);
  return !Number.isNaN(checkIn.getTime()) && checkIn >= today;
}

function guestSummary(adults, children) {
  const parts = [];
  if (adults != null) parts.push(`${adults} người lớn`);
  if (children != null) parts.push(`${children} trẻ em`);
  return parts.length ? parts.join(" · ") : "Chưa cập nhật";
}

function parsePolicySnapshot(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default function BookingsPage() {
  const location = useLocation();
  const { user } = useAuth();
  const { openHotelConversation } = useFloatingChat();
  const customerId = user?.id;

  const [bookings, setBookings] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [qrUrl, setQrUrl] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [reviewsByBooking, setReviewsByBooking] = useState({});
  const [reviewBooking, setReviewBooking] = useState(null);
  const [complaintBooking, setComplaintBooking] = useState(null);
  const [complaintByBooking, setComplaintByBooking] = useState({});
  const [complaintsStatus, setComplaintsStatus] = useState("loading");
  const [refundByBooking, setRefundByBooking] = useState({});
  const [refundBooking, setRefundBooking] = useState(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundProofUrl, setRefundProofUrl] = useState("");
  const [roomChangeByBooking, setRoomChangeByBooking] = useState({});
  const [roomChangeBooking, setRoomChangeBooking] = useState(null);
  const [roomChangeReason, setRoomChangeReason] = useState("");
  const [roomChangeBusy, setRoomChangeBusy] = useState(false);
  const [roomChangeNewMode, setRoomChangeNewMode] = useState(false);
  const [roomChangeTargetRoomId, setRoomChangeTargetRoomId] = useState("");
  const [roomChangeRooms, setRoomChangeRooms] = useState([]);
  const [roomChangeRoomTypes, setRoomChangeRoomTypes] = useState([]);
  const [roomChangeAvailableRoomIds, setRoomChangeAvailableRoomIds] = useState(null);
  const [roomChangeOptionsLoading, setRoomChangeOptionsLoading] = useState(false);
  const [roomChangeSearch, setRoomChangeSearch] = useState("");
  const [roomChangeSort, setRoomChangeSort] = useState("PRICE_ASC");
  const [roomChangeDetailType, setRoomChangeDetailType] = useState(null);
  const [roomChangeDetailImageIndex, setRoomChangeDetailImageIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState(null);
  const [refundForm, setRefundForm] = useState({
    reasonCode: "CANNOT_ARRIVE",
    note: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
  });
  const selectedPolicySnapshot = useMemo(
    () => parsePolicySnapshot(selectedBooking?.hotelPolicySnapshot),
    [selectedBooking?.hotelPolicySnapshot],
  );

  const loadMetadata = useCallback(async (items) => {
    const entries = await Promise.all(
      items.map(async (booking) => {
        const [hotelResult, roomResult, roomTypeResult] = await Promise.allSettled([
          getHotelById(booking.hotelId),
          getRoomById(booking.roomId),
          booking.roomTypeId
            ? getRoomTypeById(booking.roomTypeId)
            : Promise.resolve(null),
        ]);

        return [
          booking.id,
          {
            hotel: hotelResult.status === "fulfilled" ? hotelResult.value : null,
            room: roomResult.status === "fulfilled" ? roomResult.value : null,
            roomType:
              roomTypeResult.status === "fulfilled" ? roomTypeResult.value : null,
          },
        ];
      }),
    );

    setMetadata(Object.fromEntries(entries));
  }, []);

  const loadBookings = useCallback(async () => {
    if (!customerId) {
      setLoading(false);
      setError("Không xác định được tài khoản để tải đơn đặt phòng.");
      return;
    }

    setLoading(true);
    setComplaintsStatus("loading");
    setError("");

    try {
      const [data, reviewData, refundData, roomChangeData, complaintData] = await Promise.all([
        getMyBookings(customerId),
        getMyReviews().catch(() => []),
        getMyRefundRequests().catch(() => []),
        getMyRoomChangeRequests().catch(() => []),
        getMyComplaints().catch(() => null),
      ]);
      const normalized = Array.isArray(data) ? data : [];
      const normalizedReviews = Array.isArray(reviewData) ? reviewData : [];
      const normalizedRefunds = Array.isArray(refundData) ? refundData : [];
      const normalizedRoomChanges = Array.isArray(roomChangeData) ? roomChangeData : [];
      const normalizedComplaints = Array.isArray(complaintData) ? complaintData : [];

      setBookings(normalized);
      setReviewsByBooking(
        Object.fromEntries(
          normalizedReviews.map((review) => [review.bookingId, review]),
        ),
      );
      setRefundByBooking(
        Object.fromEntries(
          normalizedRefunds.map((item) => [String(item.bookingId), item]),
        ),
      );
      setComplaintByBooking(
        Object.fromEntries(
          normalizedComplaints
            .filter((item) => !["RESOLVED", "REJECTED", "CANCELLED"].includes(item.status))
            .map((item) => [String(item.bookingId), item]),
        ),
      );
      setComplaintsStatus(Array.isArray(complaintData) ? "ready" : "error");
      const latestRoomChangeByBooking = {};
      normalizedRoomChanges.forEach((item) => {
        const key = String(item.bookingId);
        if (!latestRoomChangeByBooking[key]) latestRoomChangeByBooking[key] = item;
      });
      setRoomChangeByBooking(latestRoomChangeByBooking);
      await loadMetadata(normalized);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải danh sách đơn đặt phòng.",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, loadMetadata]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useRealtimeRefresh(
    ["NOTIFICATION_CREATED", "AVAILABILITY_CHANGED"],
    loadBookings,
    { debounceMs: 140 },
  );

  useEffect(() => {
    if (!location.hash || loading) return undefined;

    const timer = window.setTimeout(() => {
      scrollToHashTarget(location.hash);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [location.hash, loading, bookings]);

  useEffect(() => {
    if (!selectedBooking) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") setSelectedBooking(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedBooking]);

  useEffect(() => () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
  }, [qrUrl]);

  useEffect(() => () => {
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
  }, [refundProofUrl]);

  function openRefundRequest(booking) {
    setRefundBooking(booking);
    setRefundForm({
      reasonCode: "CANNOT_ARRIVE",
      note: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
    });
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
    setRefundProofUrl("");
  }

  function closeRefundRequest() {
    setRefundBooking(null);
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
    setRefundProofUrl("");
  }

  async function submitRefundRequest(event) {
    event.preventDefault();
    if (!refundBooking || refundBusy) return;
    setRefundBusy(true);
    setError("");
    try {
      const created = await createRefundRequest({
        bookingId: refundBooking.id,
        ...refundForm,
      });
      setRefundByBooking((current) => ({
        ...current,
        [String(refundBooking.id)]: created,
      }));
      await loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể gửi yêu cầu hoàn tiền.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function openRefundProof(item) {
    if (!item?.hotelRefundProofAvailable) return;
    setRefundBusy(true);
    try {
      const blob = await getRefundHotelProof(item.id);
      if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
      setRefundProofUrl(URL.createObjectURL(blob));
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải chứng từ hoàn tiền.");
    } finally {
      setRefundBusy(false);
    }
  }

  const roomChangeRoomTypeMap = useMemo(
    () => Object.fromEntries(
      roomChangeRoomTypes.map((type) => [String(type.id), type]),
    ),
    [roomChangeRoomTypes],
  );

  const roomChangeRoomMap = useMemo(
    () => Object.fromEntries(
      roomChangeRooms.map((room) => [String(room.id), room]),
    ),
    [roomChangeRooms],
  );

  const roomChangeAvailableRooms = useMemo(() => {
    if (!roomChangeBooking) return [];
    return roomChangeRooms.filter((room) => {
      if (String(room.id) === String(roomChangeBooking.roomId)) return false;
      if (roomChangeAvailableRoomIds && !roomChangeAvailableRoomIds.has(String(room.id))) return false;
      const status = String(room.status ?? "").toUpperCase();
      if (["MAINTENANCE", "INACTIVE"].includes(status)) return false;
      const type = roomChangeRoomTypeMap[String(room.roomTypeId)];
      if (!type) return false;
      if (Number(type.maxAdults ?? 0) < Number(roomChangeBooking.adults ?? 0)) return false;
      if (Number(type.maxChildren ?? 0) < Number(roomChangeBooking.children ?? 0)) return false;
      return true;
    });
  }, [
    roomChangeAvailableRoomIds,
    roomChangeBooking,
    roomChangeRoomTypeMap,
    roomChangeRooms,
  ]);

  const roomChangeCurrentRoom = useMemo(() => {
    if (!roomChangeBooking) return null;
    return roomChangeRoomMap[String(roomChangeBooking.roomId)]
      ?? metadata[String(roomChangeBooking.id)]?.room
      ?? null;
  }, [metadata, roomChangeBooking, roomChangeRoomMap]);

  const roomChangeCurrentType = useMemo(() => {
    if (!roomChangeBooking) return null;
    const roomTypeId = roomChangeCurrentRoom?.roomTypeId ?? roomChangeBooking.roomTypeId;
    return roomChangeRoomTypeMap[String(roomTypeId)]
      ?? metadata[String(roomChangeBooking.id)]?.roomType
      ?? null;
  }, [metadata, roomChangeBooking, roomChangeCurrentRoom, roomChangeRoomTypeMap]);

  const roomChangeCurrentNightlyPrice = useMemo(() => {
    const value = roomChangeCurrentRoom?.customPrice ?? roomChangeCurrentType?.basePrice;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }, [roomChangeCurrentRoom, roomChangeCurrentType]);

  const roomChangeVisibleGroups = useMemo(() => {
    const groups = new Map();
    for (const room of roomChangeAvailableRooms) {
      const type = roomChangeRoomTypeMap[String(room.roomTypeId)];
      if (!type) continue;
      const key = String(type.id ?? room.roomTypeId);
      if (!groups.has(key)) groups.set(key, { type, rooms: [] });
      groups.get(key).rooms.push(room);
    }

    const query = roomChangeSearch.trim().toLocaleLowerCase("vi");
    const priceOf = (room, type) => Number(room.customPrice ?? type?.basePrice ?? 0);
    const result = [...groups.values()]
      .map((group) => ({
        ...group,
        rooms: [...group.rooms].sort((left, right) =>
          String(left.roomNumber ?? "").localeCompare(String(right.roomNumber ?? ""), "vi", { numeric: true }),
        ),
      }))
      .filter(({ type, rooms }) => {
        if (!query) return true;
        return [type?.name, type?.bedType, ...rooms.map((room) => room.roomNumber)]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("vi").includes(query));
      });

    return result.sort((left, right) => {
      const leftPrices = left.rooms.map((room) => priceOf(room, left.type));
      const rightPrices = right.rooms.map((room) => priceOf(room, right.type));
      const leftPrice = leftPrices.length ? Math.min(...leftPrices) : 0;
      const rightPrice = rightPrices.length ? Math.min(...rightPrices) : 0;
      if (roomChangeSort === "PRICE_DESC") return rightPrice - leftPrice;
      if (roomChangeSort === "ROOM_ASC") {
        return String(left.rooms[0]?.roomNumber ?? "").localeCompare(
          String(right.rooms[0]?.roomNumber ?? ""),
          "vi",
          { numeric: true },
        );
      }
      return leftPrice - rightPrice;
    });
  }, [roomChangeAvailableRooms, roomChangeRoomTypeMap, roomChangeSearch, roomChangeSort]);

  const roomChangeSelectedRoom = roomChangeTargetRoomId
    ? roomChangeRoomMap[String(roomChangeTargetRoomId)] ?? null
    : null;
  const roomChangeSelectedType = roomChangeSelectedRoom
    ? roomChangeRoomTypeMap[String(roomChangeSelectedRoom.roomTypeId)] ?? null
    : null;
  const roomChangeSelectedNightlyPrice = roomChangeSelectedRoom
    ? Number(roomChangeSelectedRoom.customPrice ?? roomChangeSelectedType?.basePrice ?? 0)
    : null;
  const roomChangeNightlyDifference = roomChangeSelectedNightlyPrice != null
    && roomChangeCurrentNightlyPrice != null
    ? roomChangeSelectedNightlyPrice - roomChangeCurrentNightlyPrice
    : null;

  async function loadRoomChangeOptions(booking) {
    setRoomChangeOptionsLoading(true);
    try {
      const [roomsData, roomTypesData, availability] = await Promise.all([
        getRoomsByHotel(booking.hotelId),
        getRoomTypesByHotel(booking.hotelId),
        getHotelAvailability(booking.hotelId, booking.checkIn, booking.checkOut),
      ]);
      const normalizedRooms = Array.isArray(roomsData) ? roomsData : [];
      setRoomChangeRooms(normalizedRooms);
      setRoomChangeRoomTypes(Array.isArray(roomTypesData) ? roomTypesData : []);
      const unavailable = new Set((availability?.unavailableRoomIds ?? []).map(String));
      setRoomChangeAvailableRoomIds(new Set(
        normalizedRooms
          .filter((room) => String(room.id) !== String(booking.roomId))
          .filter((room) => !unavailable.has(String(room.id)))
          .map((room) => String(room.id)),
      ));
    } catch (requestError) {
      setRoomChangeRooms([]);
      setRoomChangeRoomTypes([]);
      setRoomChangeAvailableRoomIds(new Set());
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải danh sách phòng trống để đổi.",
      );
    } finally {
      setRoomChangeOptionsLoading(false);
    }
  }

  function openRoomChangeRequest(booking) {
    setRoomChangeBooking(booking);
    setRoomChangeReason("");
    setRoomChangeSearch("");
    setRoomChangeSort("PRICE_ASC");
    const latest = roomChangeByBooking[String(booking.id)];
    setRoomChangeTargetRoomId(latest?.targetRoomId ? String(latest.targetRoomId) : "");
    setRoomChangeNewMode(!latest);
    void loadRoomChangeOptions(booking);
  }

  function closeRoomChangeRequest() {
    setRoomChangeBooking(null);
    setRoomChangeReason("");
    setRoomChangeTargetRoomId("");
    setRoomChangeRooms([]);
    setRoomChangeRoomTypes([]);
    setRoomChangeAvailableRoomIds(null);
    setRoomChangeSearch("");
    setRoomChangeSort("PRICE_ASC");
    setRoomChangeDetailType(null);
    setRoomChangeDetailImageIndex(0);
    setRoomChangeNewMode(false);
  }

  async function submitRoomChangeRequest(event) {
    event.preventDefault();
    if (
      !roomChangeBooking
      || roomChangeBusy
      || !roomChangeTargetRoomId
      || !roomChangeReason.trim()
    ) return;
    setRoomChangeBusy(true);
    setError("");
    try {
      const created = await createRoomChangeRequest(
        roomChangeBooking.id,
        roomChangeTargetRoomId,
        roomChangeReason.trim(),
      );
      setRoomChangeByBooking((current) => ({
        ...current,
        [String(roomChangeBooking.id)]: created,
      }));
      setRoomChangeTargetRoomId(String(created.targetRoomId ?? roomChangeTargetRoomId));
      setRoomChangeNewMode(false);
      setRoomChangeReason("");
      await loadBookings();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.error
          ?? "Không thể gửi yêu cầu đổi phòng.",
      );
      await loadRoomChangeOptions(roomChangeBooking);
    } finally {
      setRoomChangeBusy(false);
    }
  }

  const filteredBookings = useMemo(
    () => bookings.filter((booking) => bookingMatchesFilter(booking, filter)),
    [bookings, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleBookings = useMemo(
    () => filteredBookings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredBookings, safePage],
  );

  const summary = useMemo(() => {
    const remainingAmounts = bookings.map((booking) => (
      booking.remainingAmount == null ? null : Number(booking.remainingAmount)
    ));
    const hasCompleteRemainingData = remainingAmounts.every(Number.isFinite);

    return {
      total: bookings.length,
      upcoming: bookings.filter((booking) =>
        ["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(booking.status),
      ).length,
      staying: bookings.filter((booking) => booking.status === "CHECKED_IN").length,
      remaining: hasCompleteRemainingData
        ? remainingAmounts.reduce((total, amount) => total + amount, 0)
        : null,
    };
  }, [bookings]);

  async function openDetails(booking) {
    setSelectedBooking(booking);
    setModalLoading(true);
    setError("");

    if (qrUrl) {
      URL.revokeObjectURL(qrUrl);
      setQrUrl("");
    }

    try {
      if (["CONFIRMED", "CHECKED_IN"].includes(booking.status)) {
        const qrBlob = await getBookingQrBlob(booking.id);
        setQrUrl(URL.createObjectURL(qrBlob));
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải mã QR nhận phòng.",
      );
    } finally {
      setModalLoading(false);
    }
  }

  function closeDetails() {
    setSelectedBooking(null);
    if (qrUrl) {
      URL.revokeObjectURL(qrUrl);
      setQrUrl("");
    }
  }

  function openReviewForm(booking) {
    if (booking.status !== "CHECKED_OUT") return;
    setReviewBooking(booking);
    closeDetails();
  }

  function handleReviewSubmitted(review) {
    setReviewsByBooking((current) => ({
      ...current,
      [review.bookingId]: review,
    }));
    setReviewBooking(null);
  }

  async function handleCancel(booking) {
    setWorkingId(booking.id);
    setError("");

    try {
      await cancelBooking(booking.id);
      await loadBookings();
      setPendingAction(null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ?? "Không thể hủy đơn đặt phòng.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function handleHide(booking) {
    setWorkingId(booking.id);
    setError("");

    try {
      await hideBookingFromCustomer(booking.id);
      setBookings((current) => current.filter((item) => item.id !== booking.id));
      setMetadata((current) => {
        const next = { ...current };
        delete next[booking.id];
        return next;
      });
      setPendingAction(null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.error
          ?? "Không thể ẩn đơn khỏi danh sách.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function handlePayAgain(booking) {
    setWorkingId(booking.id);
    setError("");

    try {
      const order = await createPayOsCheckout([booking.id]);
      sessionStorage.setItem(
        "enziuroomsPayOsOrder",
        JSON.stringify({
          orderCode: order.orderCode,
          bookingIds: [booking.id],
          expiresAt: order.expiresAt,
        }),
      );

      if (!order.checkoutUrl) {
        throw new Error("PayOS không trả về đường dẫn thanh toán.");
      }

      window.location.assign(order.checkoutUrl);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.message
          ?? "Không thể tạo giao dịch thanh toán.",
      );
    } finally {
      setWorkingId("");
    }
  }

  if (loading) return <Loading message="Đang tải đơn đặt phòng..." />;

  return (
    <main className="customer-bookings-page-v2">
      <div className="container">
        <section className="booking-v2-heading">
          <div>
            <span>ĐƠN ĐẶT PHÒNG</span>
            <h1>Đơn đặt phòng của tôi</h1>
            <p>
              Theo dõi chuyến đi, thanh toán, mã nhận phòng và các đơn bạn đã đặt.
            </p>
          </div>

          <button type="button" onClick={() => void loadBookings()}>
            <RefreshCw size={18} />
            Làm mới
          </button>
        </section>

        {!error || bookings.length > 0 ? <section className="booking-v2-summary">
          <article>
            <span><ReceiptText size={21} /></span>
            <div><small>Tổng đơn</small><strong>{summary.total}</strong></div>
          </article>
          <article>
            <span><CalendarDays size={21} /></span>
            <div><small>Sắp tới</small><strong>{summary.upcoming}</strong></div>
          </article>
          <article>
            <span><BedDouble size={21} /></span>
            <div><small>Đang lưu trú</small><strong>{summary.staying}</strong></div>
          </article>
          <article>
            <span><CircleDollarSign size={21} /></span>
            <div><small>Còn phải thanh toán</small><strong>{money(summary.remaining)}</strong></div>
          </article>
        </section> : null}

        <ErrorMessage message={error} onRetry={() => void loadBookings()} />

        <section className="booking-v2-content" id="booking-list">
          <div className="booking-v2-toolbar">
            <div>
              <h2>Danh sách đơn đã đặt</h2>
              <p>Các đơn đã hủy hoặc hoàn tất có thể ẩn khỏi danh sách.</p>
            </div>

            <div className="booking-v2-count">
              {filteredBookings.length} đơn
            </div>
          </div>

          <div className="booking-v2-filters" role="tablist" aria-label="Lọc đơn đặt phòng">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "active" : ""}
                onClick={() => {
                  setFilter(item.value);
                  setPage(1);
                }}
                role="tab"
                aria-selected={filter === item.value}
                aria-controls="booking-results"
              >
                {item.label}
              </button>
            ))}
          </div>

          {filteredBookings.length === 0 ? (
            <EmptyState
              className="booking-v2-empty"
              icon={<Hotel size={32} />}
              title={error && bookings.length === 0
                ? "Chưa thể hiển thị đơn đặt phòng"
                : "Chưa có đơn phù hợp"}
              description={error && bookings.length === 0
                ? "Dữ liệu đơn đặt phòng chưa tải được. Hãy thử lại khi kết nối ổn định."
                : "Thử chọn trạng thái khác hoặc tìm một khách sạn cho chuyến đi mới."}
              actions={!(error && bookings.length === 0)
                ? <Link to="/hotels">Tìm khách sạn</Link>
                : undefined}
            />
          ) : (
            <div className="booking-v2-list" id="booking-results" role="tabpanel">
              {visibleBookings.map((booking) => {
                const itemMeta = metadata[booking.id] ?? {};
                const hotel = itemMeta.hotel;
                const room = itemMeta.room;
                const roomType = itemMeta.roomType;
                const coverUrl = hotelCover(hotel);
                const working = workingId === booking.id;

                return (
                  <article className="booking-v2-card" key={booking.id}>
                    <div className="booking-v2-cover">
                      {coverUrl ? (
                        <img src={coverUrl} alt={hotel?.name ?? "Khách sạn"} loading="lazy" decoding="async" />
                      ) : (
                        <div className="booking-v2-cover-empty">
                          <ImageOff size={34} />
                          <span>Chưa có ảnh khách sạn</span>
                        </div>
                      )}

                      <StatusBadge
                        className="booking-v2-status"
                        status={booking.status}
                        label={statusLabel(booking.status)}
                        size="sm"
                      />
                    </div>

                    <div className="booking-v2-main">
                      <div className="booking-v2-title-row">
                        <div>
                          <span className="booking-v2-code">
                            {booking.bookingCode ?? "Chưa có mã đặt phòng"}
                          </span>
                          <h3>{hotel?.name ?? "Không thể tải thông tin khách sạn"}</h3>
                          <p>
                            <MapPin size={15} />
                            {hotel?.city ?? hotel?.address ?? "Thông tin địa điểm đang cập nhật"}
                          </p>
                        </div>

                        <StatusBadge
                          className="booking-v2-payment-state"
                          status={booking.paymentStatus}
                          label={paymentStatusLabel(booking.paymentStatus, booking)}
                          size="sm"
                        />
                      </div>

                      <div className="booking-v2-facts">
                        <div>
                          <CalendarDays size={17} />
                          <span>Nhận phòng từ {formatTime(hotel?.checkInTime, "Chưa cập nhật")}</span>
                          <strong>{formatDate(booking.checkIn)}</strong>
                        </div>
                        <div>
                          <CalendarDays size={17} />
                          <span>Trả phòng trước {formatTime(hotel?.checkOutTime, "Chưa cập nhật")}</span>
                          <strong>{formatDate(booking.checkOut)}</strong>
                        </div>
                        <div>
                          <BedDouble size={17} />
                          <span>Phòng</span>
                          <strong>{roomType?.name ?? room?.roomNumber ?? "Không thể tải thông tin phòng"}</strong>
                        </div>
                        <div>
                          <Users size={17} />
                          <span>Khách</span>
                          <strong>{guestSummary(booking.adults, booking.children)}</strong>
                        </div>
                      </div>

                      <div className="booking-v2-payment-line">
                        <div>
                          <small>Phương thức</small>
                          <strong>{paymentOptionLabel(booking.paymentOption, booking.depositPercent)}</strong>
                        </div>
                        <div>
                          <small>Tổng tiền</small>
                          <strong>{money(booking.totalPrice)}</strong>
                        </div>
                        <div>
                          <small>Đã trả</small>
                          <strong className="paid">{money(booking.paidAmount)}</strong>
                        </div>
                        <div>
                          <small>Còn lại</small>
                          <strong className={Number(booking.remainingAmount ?? 0) > 0 ? "remaining" : "paid"}>
                            {money(booking.remainingAmount)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <aside className="booking-v2-actions">
                      <button
                        type="button"
                        className="booking-v2-primary-action"
                        onClick={() => void openDetails(booking)}
                      >
                        <Eye size={17} />
                        Xem chi tiết
                      </button>

                      {canChatWithHotel(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-chat-action"
                          onClick={() => openHotelConversation({
                            booking,
                            hotel: metadata[booking.id]?.hotel,
                          })}
                        >
                          <MessageCircle size={17} />
                          <span>
                            Chat với khách sạn
                          </span>
                        </button>
                      ) : null}

                      {canRequestRoomChange(booking) ? (() => {
                        const roomChange = roomChangeByBooking[String(booking.id)];
                        return (
                          <button
                            type="button"
                            className="booking-v2-room-change-action"
                            disabled={working}
                            onClick={() => openRoomChangeRequest(booking)}
                          >
                            <ArrowRightLeft size={17} />
                            {roomChange?.status === "PENDING"
                              ? "Đổi phòng: đang chờ"
                              : roomChange?.status === "APPROVED"
                                ? "Xem đổi phòng đã duyệt"
                                : "Yêu cầu đổi phòng"}
                          </button>
                        );
                      })() : null}

                      {canContinuePayment(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-pay-action"
                          disabled={working}
                          onClick={() => void handlePayAgain(booking)}
                        >
                          <CreditCard size={17} />
                          {roomChangeByBooking[String(booking.id)]?.status === "APPROVED"
                            && Number(booking.paymentDueAmount ?? 0) > 0
                            && Number(booking.paymentDueAmount ?? 0) < Number(booking.remainingAmount ?? 0)
                            ? "Bù cọc đổi phòng"
                            : "Thanh toán tiếp"}
                        </button>
                      ) : null}

                      {canCancelBooking(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-cancel-action"
                          disabled={working}
                          onClick={() => setPendingAction({ type: "cancel", booking })}
                        >
                          <XCircle size={17} />
                          Hủy đặt phòng
                        </button>
                      ) : null}

                      {canRequestRefund(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-refund-action"
                          disabled={working}
                          onClick={() => openRefundRequest(booking)}
                        >
                          <ReceiptText size={17} />
                          {refundByBooking[String(booking.id)]
                            ? refundStatusLabel(refundByBooking[String(booking.id)].status)
                            : "Yêu cầu hoàn tiền"}
                        </button>
                      ) : null}

                      {booking.status === "CHECKED_OUT" ? (
                        reviewsByBooking[booking.id] ? (
                          <button
                            type="button"
                            className="booking-v2-reviewed-action"
                            disabled
                          >
                            <Star size={17} fill="currentColor" />
                            Đã đánh giá
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="booking-v2-review-action"
                            onClick={() => openReviewForm(booking)}
                          >
                            <Star size={17} />
                            Đánh giá khách sạn
                          </button>
                        )
                      ) : null}

                      {canHideBooking(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-delete-action"
                          disabled={working}
                          onClick={() => setPendingAction({ type: "hide", booking })}
                        >
                          <Trash2 size={17} />
                          Xóa khỏi danh sách
                        </button>
                      ) : null}
                    </aside>
                  </article>
                );
              })}
            </div>
          )}
          {filteredBookings.length > 0 ? (
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              ariaLabel="Phân trang đơn đặt phòng"
            />
          ) : null}
        </section>
      </div>

      {selectedBooking && typeof document !== "undefined" ? createPortal((
        <div
          className="booking-v2-modal-backdrop booking-v2-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <section
            className="booking-v2-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Chi tiết đơn đặt phòng"
          >
            <button
              type="button"
              className="booking-v2-modal-close"
              aria-label="Đóng"
              onClick={closeDetails}
            >
              <X size={22} />
            </button>

            <div className="booking-v2-modal-header">
              <div>
                <span>CHI TIẾT ĐƠN ĐẶT PHÒNG</span>
                <h2>{selectedBooking.bookingCode || "Chưa có mã đặt phòng"}</h2>
                <p>Đặt lúc {formatDateTime(selectedBooking.createdAt)}</p>
              </div>
              <StatusBadge
                className="booking-v2-status"
                status={selectedBooking.status}
                label={statusLabel(selectedBooking.status)}
              />
            </div>

            <div className="booking-v2-modal-grid">
              <div className="booking-v2-modal-details">
                <article className="booking-v2-modal-hotel">
                  <span><Building2 size={22} /></span>
                  <div>
                    <small>Khách sạn</small>
                    <h3>{metadata[selectedBooking.id]?.hotel?.name ?? "Không thể tải thông tin khách sạn"}</h3>
                    <p>
                      <MapPin size={15} />
                      {metadata[selectedBooking.id]?.hotel?.address
                        ?? metadata[selectedBooking.id]?.hotel?.city
                        ?? "Địa chỉ đang cập nhật"}
                    </p>
                  </div>
                </article>

                <div className="booking-v2-modal-info-grid">
                  <div>
                    <CalendarDays size={18} />
                    <span>Nhận phòng từ {formatTime(metadata[selectedBooking.id]?.hotel?.checkInTime, "Chưa cập nhật")}</span>
                    <strong>{formatDate(selectedBooking.checkIn)}</strong>
                  </div>
                  <div>
                    <CalendarDays size={18} />
                    <span>Trả phòng trước {formatTime(metadata[selectedBooking.id]?.hotel?.checkOutTime, "Chưa cập nhật")}</span>
                    <strong>{formatDate(selectedBooking.checkOut)}</strong>
                  </div>
                  <div>
                    <Clock3 size={18} />
                    <span>Thời gian lưu trú</span>
                    <strong>
                      {nightsBetween(selectedBooking.checkIn, selectedBooking.checkOut) == null
                        ? "Chưa cập nhật"
                        : `${nightsBetween(selectedBooking.checkIn, selectedBooking.checkOut)} đêm`}
                    </strong>
                  </div>
                  <div>
                    <Users size={18} />
                    <span>Khách lưu trú</span>
                    <strong>{guestSummary(selectedBooking.adults, selectedBooking.children)}</strong>
                  </div>
                  <div>
                    <BedDouble size={18} />
                    <span>Loại phòng</span>
                    <strong>{metadata[selectedBooking.id]?.roomType?.name ?? "Không thể tải loại phòng"}</strong>
                  </div>
                  <div>
                    <ShieldCheck size={18} />
                    <span>Trạng thái thanh toán</span>
                    <strong>{paymentStatusLabel(selectedBooking.paymentStatus, selectedBooking)}</strong>
                  </div>
                </div>

                <div className="booking-v2-modal-payment">
                  <div><span>Tổng tiền</span><strong>{money(selectedBooking.totalPrice)}</strong></div>
                  <div><span>Đã thanh toán</span><strong className="paid">{money(selectedBooking.paidAmount)}</strong></div>
                  <div><span>Còn phải thanh toán</span><strong className="remaining">{money(selectedBooking.remainingAmount)}</strong></div>
                </div>

                {roomChangeByBooking[String(selectedBooking.id)] ? (() => {
                  const roomChange = roomChangeByBooking[String(selectedBooking.id)];
                  return (
                    <div className={`booking-v2-room-change-summary is-${String(roomChange.status ?? "").toLowerCase()}`}>
                      <div>
                        <ArrowRightLeft size={18} />
                        <div>
                          <strong>{roomChangeStatusLabel(roomChange.status)}</strong>
                          <span>{roomChange.reason}</span>
                        </div>
                      </div>
                      {roomChange.status === "APPROVED" ? (
                        <p>Giá sau đổi: <b>{money(roomChange.newTotalPrice)}</b>{Number(roomChange.additionalPaymentDue ?? 0) > 0 ? ` · Khoản bổ sung lúc duyệt: ${money(roomChange.additionalPaymentDue)}` : ""}</p>
                      ) : roomChange.reviewNote ? <p>Phản hồi khách sạn: {roomChange.reviewNote}</p> : null}
                    </div>
                  );
                })() : null}

                {selectedBooking.specialRequest ? (
                  <div className="booking-v2-special-request">
                    <strong>Yêu cầu đặc biệt</strong>
                    <p>{selectedBooking.specialRequest}</p>
                  </div>
                ) : null}

                <BookingTermsPanel
                  mode="detail"
                  hotel={metadata[selectedBooking.id]?.hotel}
                  roomTypes={[metadata[selectedBooking.id]?.roomType].filter(Boolean)}
                  roomNames={[metadata[selectedBooking.id]?.roomType?.name].filter(Boolean)}
                  checkIn={selectedBooking.checkIn}
                  checkOut={selectedBooking.checkOut}
                  adults={selectedBooking.adults}
                  children={selectedBooking.children}
                  totalAmount={selectedBooking.totalPrice}
                  depositAmount={selectedBooking.paymentOption === "DEPOSIT" ? selectedBooking.paymentDueAmount : null}
                  paidAmount={selectedBooking.paidAmount}
                  remainingAmount={selectedBooking.remainingAmount}
                  paymentOption={paymentOptionLabel(selectedBooking.paymentOption, selectedBooking.depositPercent)}
                  hotelPromotionCode={selectedBooking.hotelPromotionCode}
                  platformPromotionCode={selectedBooking.platformPromotionCode}
                  hotelPolicyOverride={selectedPolicySnapshot}
                  minimumAgeOverride={selectedBooking.minimumAgeSnapshot}
                  refundableOverride={selectedBooking.roomRefundableSnapshot}
                />
              </div>

              <aside className="booking-v2-qr-panel">
                <QrCode size={28} />
                <h3>QR nhận phòng</h3>

                {modalLoading ? (
                  <div className="booking-v2-qr-loading">Đang tải QR...</div>
                ) : qrUrl ? (
                  <img src={qrUrl} alt="QR check-in" />
                ) : (
                  <div className="booking-v2-qr-unavailable">
                    QR sẽ xuất hiện sau khi booking được xác nhận.
                  </div>
                )}

                <p>Đưa mã này cho lễ tân khi đến nhận phòng.</p>

                {canContinuePayment(selectedBooking) ? (
                  <button
                    type="button"
                    disabled={workingId === selectedBooking.id}
                    onClick={() => void handlePayAgain(selectedBooking)}
                  >
                    <CreditCard size={17} />
                    Thanh toán phần còn lại
                  </button>
                ) : null}

                {selectedBooking.status === "CHECKED_OUT" ? (
                  reviewsByBooking[selectedBooking.id] ? (
                    <div className="booking-v2-review-done">
                      <Star size={17} fill="currentColor" />
                      Bạn đã đánh giá kỳ nghỉ này
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="booking-v2-review-modal-action"
                      onClick={() => openReviewForm(selectedBooking)}
                    >
                      <Star size={17} />
                      Đánh giá khách sạn
                    </button>
                  )
                ) : null}

                <button
                  type="button"
                  className={`booking-v2-complaint-action${complaintByBooking[String(selectedBooking.id)] ? " is-view" : ""}`}
                  disabled={complaintsStatus !== "ready"}
                  onClick={() => {
                    const existingComplaint = complaintByBooking[String(selectedBooking.id)];
                    if (existingComplaint) {
                      window.location.assign(`/customer/complaints?case=${encodeURIComponent(existingComplaint.id)}`);
                      return;
                    }
                    setComplaintBooking(selectedBooking);
                    closeDetails();
                  }}
                >
                  <LifeBuoy size={17} />
                  {complaintsStatus === "loading"
                    ? "Đang kiểm tra khiếu nại..."
                    : complaintsStatus === "error"
                      ? "Chưa thể kiểm tra khiếu nại"
                    : complaintByBooking[String(selectedBooking.id)]
                      ? "Xem khiếu nại"
                      : "Khiếu nại / Báo cáo sự cố"}
                </button>

                <Link to={`/hotels/${selectedBooking.hotelId}`} onClick={closeDetails}>
                  Xem khách sạn
                  <ChevronRight size={16} />
                </Link>
              </aside>
            </div>
          </section>
        </div>
      ), document.body) : null}

      {roomChangeBooking ? (() => {
        const latest = roomChangeByBooking[String(roomChangeBooking.id)];
        const showForm = roomChangeNewMode || !latest;
        return (
          <div
            className="booking-v2-modal-backdrop booking-v2-room-change-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeRoomChangeRequest();
            }}
          >
            <section className={`booking-v2-room-change-modal${!showForm ? " is-status" : ""}`} role="dialog" aria-modal="true" aria-label="Yêu cầu đổi phòng">
              <button type="button" className="booking-v2-modal-close" onClick={closeRoomChangeRequest} aria-label="Đóng"><X size={22} /></button>
              <div className="booking-v2-modal-header">
                <div>
                  <span>YÊU CẦU ĐỔI PHÒNG</span>
                  <h2>{roomChangeBooking.bookingCode}</h2>
                  <p>Bạn chọn chính xác phòng muốn đổi sang. Khách sạn sẽ kiểm tra lại phòng đó và duyệt hoặc từ chối yêu cầu.</p>
                </div>
              </div>

              {!showForm && latest ? (() => {
                const requestedRoom = latest.targetRoomId
                  ? roomChangeRoomMap[String(latest.targetRoomId)]
                  : null;
                const requestedType = requestedRoom
                  ? roomChangeRoomTypeMap[String(requestedRoom.roomTypeId)]
                  : null;
                const isApproved = latest.status === "APPROVED";
                const isRejected = latest.status === "REJECTED";
                const resultTitle = isApproved
                  ? "Khách sạn đã duyệt đổi phòng"
                  : isRejected
                    ? "Yêu cầu đổi phòng chưa được chấp nhận"
                    : "Yêu cầu đã được gửi đến khách sạn";
                const resultDescription = isApproved
                  ? Number(latest.additionalPaymentDue ?? 0) > 0
                    ? `Đơn đặt phòng đã chuyển sang phòng bạn chọn. Bạn cần thanh toán thêm ${money(latest.additionalPaymentDue)} theo phương thức thanh toán hiện tại.`
                    : "Đơn đặt phòng đã được cập nhật sang phòng bạn chọn và không phát sinh khoản thanh toán thêm."
                  : isRejected
                    ? "Khách sạn đã phản hồi yêu cầu này. Bạn có thể chọn phòng khác nếu đơn vẫn còn đủ điều kiện đổi phòng."
                    : "Khách sạn đang kiểm tra tình trạng phòng. Bạn không cần gửi lại yêu cầu khi đang chờ xử lý.";

                return (
                  <div className={`booking-v2-room-change-result is-${String(latest.status ?? "pending").toLowerCase()}`}>
                    <div className="booking-v2-room-change-result-hero">
                      <span className="booking-v2-room-change-result-icon">
                        {isApproved ? <CheckCircle2 size={25} /> : isRejected ? <XCircle size={25} /> : <Clock3 size={25} />}
                      </span>
                      <div className="booking-v2-room-change-result-copy">
                        <small>TRẠNG THÁI YÊU CẦU</small>
                        <h3>{resultTitle}</h3>
                        <p>{resultDescription}</p>
                      </div>
                      <StatusBadge
                        status={latest.status}
                        label={roomChangeStatusLabel(latest.status)}
                        tone={isApproved ? "success" : isRejected ? "danger" : "warning"}
                      />
                    </div>

                    {latest.targetRoomId ? (
                      <div className="booking-v2-room-change-result-room">
                        <div className="booking-v2-room-change-result-room-icon"><BedDouble size={20} /></div>
                        <div>
                          <small>{isApproved ? "Phòng đã được chuyển sang" : "Phòng bạn yêu cầu"}</small>
                          <strong>
                            {requestedType?.name ?? "Loại phòng"}
                            {requestedRoom?.roomNumber ? ` · Phòng ${requestedRoom.roomNumber}` : ""}
                          </strong>
                        </div>
                        {requestedType ? (
                          <button
                            type="button"
                            onClick={() => { setRoomChangeDetailType(requestedType); setRoomChangeDetailImageIndex(0); }}
                          >
                            <Eye size={15} /> Xem loại phòng
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {isApproved ? (
                      <div className="booking-v2-room-change-result-money">
                        <div><small>Giá trước khi đổi</small><strong>{money(latest.oldTotalPrice)}</strong></div>
                        <div><small>Giá sau đổi</small><strong>{money(latest.newTotalPrice)}</strong></div>
                        <div><small>Chênh lệch</small><strong className={Number(latest.priceDifference ?? 0) > 0 ? "is-up" : Number(latest.priceDifference ?? 0) < 0 ? "is-down" : ""}>{money(latest.priceDifference)}</strong></div>
                        <div className="is-important"><small>Cần thanh toán thêm</small><strong>{money(latest.additionalPaymentDue)}</strong></div>
                      </div>
                    ) : null}

                    <div className="booking-v2-room-change-result-notes">
                      <div>
                        <small>Lý do bạn đã gửi</small>
                        <p>{latest.reason}</p>
                      </div>
                      {latest.reviewNote ? (
                        <div className="hotel-reply">
                          <small>Phản hồi từ khách sạn</small>
                          <p>{latest.reviewNote}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="booking-v2-room-change-result-actions">
                      <button type="button" className="secondary" onClick={closeRoomChangeRequest}>Đóng</button>
                      {latest.status !== "PENDING" && canRequestRoomChange(roomChangeBooking) ? (
                        <button type="button" className="primary" onClick={() => { setRoomChangeTargetRoomId(""); setRoomChangeNewMode(true); }}>
                          <ArrowRightLeft size={17} /> Chọn phòng khác
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })() : (
                <form className="booking-v2-room-change-form booking-v2-room-change-form-premium" onSubmit={submitRoomChangeRequest}>
                  <div className="booking-v2-room-change-current-card">
                    <div className="booking-v2-room-change-current-room">
                      <div className="booking-v2-room-change-current-thumb">
                        {roomTypeCover(roomChangeCurrentType) ? (
                          <img src={roomTypeCover(roomChangeCurrentType)} alt={roomChangeCurrentType?.name ?? "Phòng hiện tại"} />
                        ) : (
                          <BedDouble size={22} />
                        )}
                      </div>
                      <div>
                        <small>Phòng hiện tại</small>
                        <button
                          type="button"
                          className="booking-v2-room-change-current-type-link"
                          onClick={() => {
                            if (!roomChangeCurrentType) return;
                            setRoomChangeDetailType(roomChangeCurrentType);
                            setRoomChangeDetailImageIndex(0);
                          }}
                        >
                          {roomChangeCurrentType?.name ?? "Loại phòng"}
                          {roomChangeCurrentType ? <Eye size={14} /> : null}
                        </button>
                        <span>Phòng {roomChangeCurrentRoom?.roomNumber ?? "—"}</span>
                      </div>
                    </div>
                    <div className="booking-v2-room-change-current-stat">
                      <CalendarDays size={18} />
                      <div>
                        <small>Thời gian lưu trú</small>
                        <strong>{formatDate(roomChangeBooking.checkIn)} → {formatDate(roomChangeBooking.checkOut)}</strong>
                      </div>
                    </div>
                    <div className="booking-v2-room-change-current-stat">
                      <Users size={18} />
                      <div>
                        <small>Khách</small>
                        <strong>{guestSummary(roomChangeBooking.adults, roomChangeBooking.children)}</strong>
                      </div>
                    </div>
                    <div className="booking-v2-room-change-current-stat booking-v2-room-change-current-price">
                      <CircleDollarSign size={18} />
                      <div>
                        <small>Giá phòng hiện tại</small>
                        <strong>{roomChangeCurrentNightlyPrice == null ? "—" : `${money(roomChangeCurrentNightlyPrice)}/đêm`}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="booking-v2-room-change-policy booking-v2-room-change-policy-premium">
                    <div className="booking-v2-room-change-policy-icon"><ShieldCheck size={20} /></div>
                    <div>
                      <strong>Nguyên tắc xử lý</strong>
                      <ul>
                        <li>Chỉ hiển thị các phòng đang trống và phù hợp với toàn bộ kỳ lưu trú của bạn.</li>
                        <li>Khách sạn sẽ kiểm tra lại tình trạng phòng trước khi duyệt yêu cầu.</li>
                        <li>Nếu phòng mới đắt hơn, hệ thống sẽ tính khoản cọc/thanh toán cần bù sau khi được duyệt.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="booking-v2-room-change-room-picker booking-v2-room-change-room-picker-premium">
                    <div className="booking-v2-room-change-picker-head booking-v2-room-change-picker-head-premium">
                      <div>
                        <strong>Chọn phòng muốn đổi sang</strong>
                        <span>Chỉ hiển thị các phòng còn trống, đủ sức chứa và đang được mở bán.</span>
                      </div>
                      <div className="booking-v2-room-change-picker-tools">
                        <label className="booking-v2-room-change-search">
                          <Search size={16} />
                          <input
                            type="search"
                            value={roomChangeSearch}
                            onChange={(event) => setRoomChangeSearch(event.target.value)}
                            placeholder="Tìm loại phòng hoặc số phòng..."
                          />
                        </label>
                        <label className="booking-v2-room-change-sort">
                          <ArrowUpDown size={15} />
                          <select value={roomChangeSort} onChange={(event) => setRoomChangeSort(event.target.value)}>
                            <option value="PRICE_ASC">Giá tăng dần</option>
                            <option value="PRICE_DESC">Giá giảm dần</option>
                            <option value="ROOM_ASC">Số phòng</option>
                          </select>
                        </label>
                        <button type="button" onClick={() => void loadRoomChangeOptions(roomChangeBooking)} disabled={roomChangeOptionsLoading}>
                          <RefreshCw size={15} /> Làm mới
                        </button>
                      </div>
                    </div>

                    {roomChangeOptionsLoading ? (
                      <div className="booking-v2-room-change-loading"><Clock3 size={17} /> Đang kiểm tra phòng trống...</div>
                    ) : roomChangeAvailableRooms.length === 0 ? (
                      <div className="booking-v2-room-change-empty">Hiện không có phòng khác phù hợp và còn trống trong toàn bộ kỳ lưu trú.</div>
                    ) : roomChangeVisibleGroups.length === 0 ? (
                      <div className="booking-v2-room-change-empty">Không tìm thấy loại phòng hoặc số phòng phù hợp với từ khóa bạn nhập.</div>
                    ) : (
                      <div className="booking-v2-room-change-type-grid">
                        {roomChangeVisibleGroups.map(({ type, rooms }) => {
                          const imageUrl = roomTypeCover(type);
                          const bed = bedSummary(type);
                          const prices = rooms
                            .map((room) => Number(room.customPrice ?? type?.basePrice))
                            .filter(Number.isFinite);
                          const minPrice = prices.length ? Math.min(...prices) : null;
                          const maxPrice = prices.length ? Math.max(...prices) : null;
                          const selectedRoomInGroup = rooms.find(
                            (room) => String(room.id) === String(roomChangeTargetRoomId),
                          ) ?? null;
                          const selectedPrice = selectedRoomInGroup
                            ? Number(selectedRoomInGroup.customPrice ?? type?.basePrice ?? 0)
                            : null;
                          const selectedDifference = selectedPrice != null && roomChangeCurrentNightlyPrice != null
                            ? selectedPrice - roomChangeCurrentNightlyPrice
                            : null;

                          return (
                            <article
                              key={type?.id ?? rooms[0]?.roomTypeId}
                              className={`booking-v2-room-change-type-card${selectedRoomInGroup ? " is-selected" : ""}`}
                            >
                              <button
                                type="button"
                                className="booking-v2-room-change-type-image-button"
                                onClick={() => {
                                  setRoomChangeDetailType(type);
                                  setRoomChangeDetailImageIndex(0);
                                }}
                                aria-label={`Xem chi tiết loại phòng ${type?.name ?? ""}`}
                              >
                                <div className="booking-v2-room-change-type-image">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={type?.name ?? "Ảnh loại phòng"} />
                                  ) : (
                                    <div><ImageOff size={24} /><span>Chưa có ảnh</span></div>
                                  )}
                                </div>
                              </button>

                              <div className="booking-v2-room-change-type-main">
                                <div className="booking-v2-room-change-type-head">
                                  <div>
                                    <button
                                      type="button"
                                      className="booking-v2-room-change-type-title"
                                      onClick={() => {
                                        setRoomChangeDetailType(type);
                                        setRoomChangeDetailImageIndex(0);
                                      }}
                                    >
                                      {type?.name ?? "Loại phòng"}
                                      <Eye size={15} />
                                    </button>
                                    <span className="booking-v2-room-change-type-hint">Di chuột hoặc bấm để xem chi tiết</span>
                                  </div>
                                  <span className="booking-v2-room-change-available-count">Còn {rooms.length} phòng</span>
                                </div>

                                <div className="booking-v2-room-change-type-meta">
                                  <span><Users size={14} /> {type?.maxAdults ?? 0} người lớn{Number(type?.maxChildren ?? 0) > 0 ? ` · ${type.maxChildren} trẻ em` : ""}</span>
                                  {bed ? <span><BedDouble size={14} /> {bed}</span> : null}
                                  {type?.areaSqm ? <span>{type.areaSqm} m²</span> : null}
                                </div>

                                <div className="booking-v2-room-change-type-price-row">
                                  <div>
                                    <small>Giá phòng</small>
                                    <strong>{minPrice == null ? "—" : maxPrice != null && maxPrice !== minPrice ? `Từ ${money(minPrice)}/đêm` : `${money(minPrice)}/đêm`}</strong>
                                  </div>
                                  {selectedDifference != null ? (
                                    <b className={selectedDifference > 0 ? "is-up" : selectedDifference < 0 ? "is-down" : "is-same"}>
                                      {selectedDifference === 0 ? "Cùng giá" : `${selectedDifference > 0 ? "+" : ""}${money(selectedDifference)}/đêm`}
                                    </b>
                                  ) : null}
                                </div>

                                <div className="booking-v2-room-change-room-choice">
                                  <div className="booking-v2-room-change-room-choice-label">
                                    <strong>Chọn số phòng</strong>
                                    <span>Bạn chọn chính xác phòng muốn đổi sang</span>
                                  </div>
                                  <div className="booking-v2-room-change-room-number-list">
                                    {rooms.map((room) => {
                                      const selected = String(room.id) === String(roomChangeTargetRoomId);
                                      const roomPrice = Number(room.customPrice ?? type?.basePrice);
                                      return (
                                        <button
                                          type="button"
                                          key={room.id}
                                          className={selected ? "is-selected" : ""}
                                          onClick={() => setRoomChangeTargetRoomId(String(room.id))}
                                          title={Number.isFinite(roomPrice) ? `${money(roomPrice)}/đêm` : `Phòng ${room.roomNumber ?? ""}`}
                                        >
                                          <BedDouble size={14} />
                                          Phòng {room.roomNumber ?? "—"}
                                          {selected ? <CheckCircle2 size={15} /> : null}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <label className="booking-v2-room-change-reason-field">
                    <span>Lý do muốn đổi phòng <b>*</b></span>
                    <textarea
                      required
                      rows={3}
                      maxLength={1000}
                      value={roomChangeReason}
                      onChange={(event) => setRoomChangeReason(event.target.value)}
                      placeholder="Ví dụ: Tôi cần phòng rộng hơn vì có thêm trẻ em đi cùng..."
                    />
                    <small>{roomChangeReason.length}/1000 ký tự</small>
                  </label>

                  <div className="booking-v2-room-change-footer">
                    <div className="booking-v2-room-change-selected-summary">
                      <div className="booking-v2-room-change-selected-thumb">
                        {roomTypeCover(roomChangeSelectedType) ? (
                          <img src={roomTypeCover(roomChangeSelectedType)} alt={roomChangeSelectedType?.name ?? "Phòng đã chọn"} />
                        ) : (
                          <BedDouble size={20} />
                        )}
                      </div>
                      <div>
                        <small>{roomChangeSelectedRoom ? "Phòng bạn đã chọn" : "Chưa chọn phòng mới"}</small>
                        <strong>
                          {roomChangeSelectedRoom
                            ? `${roomChangeSelectedType?.name ?? "Loại phòng"} · Phòng ${roomChangeSelectedRoom.roomNumber ?? "—"}`
                            : "Vui lòng chọn một phòng ở trên"}
                        </strong>
                      </div>
                    </div>
                    <div className="booking-v2-room-change-difference-summary">
                      <small>Chênh lệch giá/đêm</small>
                      <strong className={roomChangeNightlyDifference > 0 ? "is-up" : roomChangeNightlyDifference < 0 ? "is-down" : ""}>
                        {roomChangeNightlyDifference == null
                          ? "—"
                          : roomChangeNightlyDifference === 0
                            ? "0 ₫"
                            : `${roomChangeNightlyDifference > 0 ? "+" : ""}${money(roomChangeNightlyDifference)}`}
                      </strong>
                      <span>Khoản cần thanh toán thêm sẽ được xác định khi khách sạn duyệt yêu cầu.</span>
                    </div>
                    <div className="booking-v2-room-change-footer-actions">
                      <button type="button" onClick={closeRoomChangeRequest}>Hủy</button>
                      <button type="submit" disabled={roomChangeBusy || roomChangeOptionsLoading || !roomChangeTargetRoomId || !roomChangeReason.trim()}>
                        <ArrowRightLeft size={17} />
                        {roomChangeBusy ? "Đang gửi..." : "Gửi yêu cầu đổi phòng"}
                        {!roomChangeBusy ? <ChevronRight size={16} /> : null}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </section>
          </div>
        );
      })() : null}



      {roomChangeDetailType ? (() => {
        const images = roomTypeImageUrls(roomChangeDetailType);
        const safeIndex = Math.min(roomChangeDetailImageIndex, Math.max(images.length - 1, 0));
        const selectedImage = images[safeIndex] ?? "";
        const availableRoomsForType = roomChangeAvailableRooms.filter(
          (room) => String(room.roomTypeId) === String(roomChangeDetailType.id),
        );
        const detailPrices = availableRoomsForType
          .map((room) => Number(room.customPrice ?? roomChangeDetailType.basePrice))
          .filter(Number.isFinite);
        const detailMinPrice = detailPrices.length ? Math.min(...detailPrices) : Number(roomChangeDetailType.basePrice ?? 0);
        const detailBed = bedSummary(roomChangeDetailType);
        const amenities = Array.isArray(roomChangeDetailType.amenities) ? roomChangeDetailType.amenities.filter(Boolean) : [];

        return (
          <div className="booking-v2-room-type-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoomChangeDetailType(null); }}>
            <section className="booking-v2-room-type-detail-modal" role="dialog" aria-modal="true" aria-label={`Chi tiết loại phòng ${roomChangeDetailType.name ?? ""}`} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="booking-v2-room-type-detail-close" onClick={() => setRoomChangeDetailType(null)} aria-label="Đóng chi tiết loại phòng"><X size={21} /></button>
              <div className="booking-v2-room-type-detail-gallery">
                <div className="booking-v2-room-type-detail-main-image">
                  {selectedImage ? <img src={selectedImage} alt={roomChangeDetailType.name ?? "Loại phòng"} /> : <div><ImageOff size={32} /><span>Loại phòng chưa có hình ảnh</span></div>}
                  {images.length > 1 ? (
                    <div className="booking-v2-room-type-detail-image-nav">
                      <button type="button" onClick={() => setRoomChangeDetailImageIndex((current) => current === 0 ? images.length - 1 : current - 1)} aria-label="Ảnh trước">‹</button>
                      <span>{safeIndex + 1}/{images.length}</span>
                      <button type="button" onClick={() => setRoomChangeDetailImageIndex((current) => current === images.length - 1 ? 0 : current + 1)} aria-label="Ảnh sau">›</button>
                    </div>
                  ) : null}
                </div>
                {images.length > 1 ? (
                  <div className="booking-v2-room-type-detail-thumbs">
                    {images.slice(0, 6).map((image, index) => (
                      <button type="button" key={`${image}-${index}`} className={index === safeIndex ? "is-active" : ""} onClick={() => setRoomChangeDetailImageIndex(index)}>
                        <img src={image} alt={`Ảnh ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="booking-v2-room-type-detail-copy">
                <span className="booking-v2-room-type-detail-kicker">CHI TIẾT LOẠI PHÒNG</span>
                <h2>{roomChangeDetailType.name ?? "Loại phòng"}</h2>
                <div className="booking-v2-room-type-detail-price-line">
                  <strong>{Number.isFinite(detailMinPrice) && detailMinPrice > 0 ? `${money(detailMinPrice)}/đêm` : "Liên hệ khách sạn"}</strong>
                  <span>Còn {availableRoomsForType.length} phòng phù hợp kỳ lưu trú</span>
                </div>
                <p className="booking-v2-room-type-detail-description">{roomChangeDetailType.description || "Khách sạn chưa cập nhật mô tả chi tiết cho loại phòng này."}</p>
                <div className="booking-v2-room-type-detail-facts">
                  <span><Users size={17} /> Tối đa {roomChangeDetailType.maxAdults ?? 0} người lớn{Number(roomChangeDetailType.maxChildren ?? 0) > 0 ? ` · ${roomChangeDetailType.maxChildren} trẻ em` : ""}</span>
                  {detailBed ? <span><BedDouble size={17} /> {detailBed}</span> : null}
                  {roomChangeDetailType.areaSqm ? <span><Building2 size={17} /> {roomChangeDetailType.areaSqm} m²</span> : null}
                  <span><CircleDollarSign size={17} /> {roomChangeDetailType.refundable ? "Có hoàn tiền theo chính sách" : "Không hoàn tiền"}</span>
                </div>
                <div className="booking-v2-room-type-detail-policies">
                  <span><CheckCircle2 size={16} /> {roomChangeDetailType.breakfastIncluded ? "Bao gồm bữa sáng" : "Không bao gồm bữa sáng"}</span>
                  <span><CheckCircle2 size={16} /> {roomChangeDetailType.payAtHotelAllowed !== false ? "Có thể thanh toán tại khách sạn" : "Thanh toán online"}</span>
                  <span><CheckCircle2 size={16} /> {roomChangeDetailType.smokingAllowed ? "Cho phép hút thuốc" : "Phòng không hút thuốc"}</span>
                </div>
                <div className="booking-v2-room-type-detail-amenities">
                  <strong>Tiện nghi trong phòng</strong>
                  <div>{amenities.length ? amenities.map((amenity) => <span key={String(amenity)}><CheckCircle2 size={14} /> {String(amenity)}</span>) : <small>Khách sạn chưa cập nhật tiện nghi cho loại phòng này.</small>}</div>
                </div>
                <div className="booking-v2-room-type-detail-available-rooms">
                  <strong>Phòng đang trống trong kỳ lưu trú của bạn</strong>
                  <div>{availableRoomsForType.length ? availableRoomsForType.map((room) => (
                    <button type="button" key={room.id} onClick={() => { setRoomChangeTargetRoomId(String(room.id)); setRoomChangeDetailType(null); }}>Phòng {room.roomNumber ?? "—"}<ChevronRight size={14} /></button>
                  )) : <small>Không còn phòng phù hợp ở loại phòng này.</small>}</div>
                </div>
              </div>
            </section>
          </div>
        );
      })() : null}

      {refundBooking ? (
        <div
          className="booking-v2-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRefundRequest();
          }}
        >
          <section
            className="booking-v2-refund-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Yêu cầu hoàn tiền đơn đặt phòng"
          >
            <button
              type="button"
              className="booking-v2-modal-close"
              onClick={closeRefundRequest}
              aria-label="Đóng yêu cầu hoàn tiền"
            >
              <X size={22} />
            </button>
            <div className="booking-v2-modal-header">
              <div>
                <span>HOÀN TIỀN BOOKING</span>
                <h2>{refundBooking.bookingCode}</h2>
                <p>Tiền EnziuRooms giữ và tiền khách sạn thu trực tiếp được xử lý tách riêng.</p>
              </div>
            </div>

            {refundByBooking[String(refundBooking.id)] ? (() => {
              const item = refundByBooking[String(refundBooking.id)];
              return (
                <div className="booking-v2-refund-status-view">
                  <StatusBadge
                    className="booking-v2-refund-state"
                    status={item.status}
                    label={refundStatusLabel(item.status)}
                  />
                  <div className="booking-v2-refund-policy">
                    <strong>Chính sách áp dụng</strong>
                    <p>{item.policyMessage}</p>
                  </div>
                  <div className="booking-v2-refund-money-grid">
                    <div><small>Đã thanh toán</small><strong>{money(item.totalPaidAmount)}</strong></div>
                    <div><small>EnziuRooms xử lý</small><strong>{money(item.platformHeldAmount)}</strong></div>
                    <div><small>Khách sạn hoàn trực tiếp</small><strong>{money(item.hotelDirectAmount)}</strong></div>
                    <div><small>Đối soát thủ công</small><strong>{money(item.manualReconciliationAmount)}</strong></div>
                  </div>
                  {item.reviewNote ? (
                    <div className="booking-v2-refund-note"><strong>Phản hồi khách sạn</strong><p>{item.reviewNote}</p></div>
                  ) : null}
                  {Number(item.hotelDirectAmount ?? 0) > 0 ? (
                    <div className="booking-v2-refund-destination">
                      <strong>Tài khoản nhận phần khách sạn hoàn trực tiếp</strong>
                      <span>{item.refundBankName} · {item.refundAccountNumber} · {item.refundAccountName}</span>
                    </div>
                  ) : null}
                  {item.hotelRefundProofAvailable ? (
                    <button type="button" className="booking-v2-refund-proof-button" disabled={refundBusy} onClick={() => void openRefundProof(item)}>
                      Xem chứng từ khách sạn hoàn tiền
                    </button>
                  ) : null}
                  {refundProofUrl ? <img className="booking-v2-refund-proof-image" src={refundProofUrl} alt="Chứng từ hoàn tiền" /> : null}
                </div>
              );
            })() : (
              <form className="booking-v2-refund-form" onSubmit={submitRefundRequest}>
                <div className="booking-v2-refund-warning">
                  <strong>Không đến nhận phòng không đồng nghĩa tự động được hoàn tiền.</strong>
                  <span>Khách sạn sẽ xét chính sách. Nếu khách sạn đã thu tiền trực tiếp, khách sạn phải tự hoàn và tải chứng từ.</span>
                </div>
                <div className="booking-v2-refund-summary">
                  <div><small>Trạng thái</small><strong>{statusLabel(refundBooking.status)}</strong></div>
                  <div><small>Đã thanh toán</small><strong>{money(refundBooking.paidAmount)}</strong></div>
                </div>
                <label>
                  Lý do
                  <select value={refundForm.reasonCode} onChange={(event) => setRefundForm((current) => ({ ...current, reasonCode: event.target.value }))}>
                    <option value="CANNOT_ARRIVE">Tôi không thể đến</option>
                    <option value="HOTEL_APPROVED">Khách sạn đã đồng ý cho hủy</option>
                    <option value="PERSONAL_ISSUE">Sự cố cá nhân</option>
                    <option value="OTHER">Lý do khác</option>
                  </select>
                </label>
                <label>
                  Ghi chú
                  <textarea rows={3} maxLength={1000} value={refundForm.note} onChange={(event) => setRefundForm((current) => ({ ...current, note: event.target.value }))} placeholder="Mô tả ngắn lý do hoặc trao đổi đã có với khách sạn" />
                </label>
                <div className="booking-v2-refund-bank">
                  <strong>Tài khoản nhận hoàn tiền (dùng khi khách sạn phải hoàn trực tiếp)</strong>
                  <input required placeholder="Ngân hàng, VD: TPBank" value={refundForm.bankName} onChange={(event) => setRefundForm((current) => ({ ...current, bankName: event.target.value }))} />
                  <input required placeholder="Số tài khoản" value={refundForm.accountNumber} onChange={(event) => setRefundForm((current) => ({ ...current, accountNumber: event.target.value }))} />
                  <input required placeholder="Tên chủ tài khoản" value={refundForm.accountName} onChange={(event) => setRefundForm((current) => ({ ...current, accountName: event.target.value }))} />
                </div>
                <button type="submit" className="booking-v2-refund-submit" disabled={refundBusy}>
                  {refundBusy ? "Đang gửi..." : "Gửi yêu cầu hoàn tiền"}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.type === "cancel" ? "Hủy đơn đặt phòng?" : "Ẩn đơn khỏi danh sách?"}
        description={pendingAction?.type === "cancel"
          ? `Bạn sắp hủy ${pendingAction?.booking?.bookingCode ? `đơn ${pendingAction.booking.bookingCode}` : "đơn đặt phòng này"}. Chính sách hủy hiện tại vẫn được áp dụng.`
          : "Đơn sẽ được ẩn khỏi danh sách của bạn và vẫn có thể được tra cứu lại khi cần."}
        confirmLabel={pendingAction?.type === "cancel" ? "Xác nhận hủy" : "Ẩn đơn"}
        busy={workingId === pendingAction?.booking?.id}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction?.booking) return;
          if (pendingAction.type === "cancel") {
            void handleCancel(pendingAction.booking);
          } else {
            void handleHide(pendingAction.booking);
          }
        }}
      />

      {reviewBooking ? (
        <ReviewFormModal
          booking={reviewBooking}
          hotel={metadata[reviewBooking.id]?.hotel}
          roomType={metadata[reviewBooking.id]?.roomType}
          onClose={() => setReviewBooking(null)}
          onSubmitted={handleReviewSubmitted}
        />
      ) : null}

      <ComplaintCreateModal
        open={Boolean(complaintBooking)}
        booking={complaintBooking}
        hotel={complaintBooking ? metadata[complaintBooking.id]?.hotel : null}
        roomType={complaintBooking ? metadata[complaintBooking.id]?.roomType : null}
        onClose={() => setComplaintBooking(null)}
        onCreated={(created) => {
          setComplaintBooking(null);
          window.location.assign(`/customer/complaints?case=${encodeURIComponent(created.id)}`);
        }}
      />
    </main>
  );
}
