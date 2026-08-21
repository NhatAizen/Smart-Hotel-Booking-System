import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Eye,
  Hotel,
  ImageOff,
  MapPin,
  MessageCircle,
  QrCode,
  ReceiptText,
  RefreshCw,
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
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
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
import CustomerHotelChat from "../../components/chat/CustomerHotelChat";
import {
  cancelBooking,
  getBookingQrBlob,
  getMyBookings,
  getMyReviews,
  hideBookingFromCustomer,
} from "../../services/bookingService";
import {
  getHotelById,
  getRoomById,
  getRoomTypeById,
} from "../../services/hotelService";
import {
  createPayOsCheckout,
  createRefundRequest,
  getMyRefundRequests,
  getRefundHotelProof,
} from "../../services/paymentService";
import { getCustomerConversations } from "../../services/chatService";
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
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} ₫` : "—";
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

function guestSummary(adults, children) {
  const parts = [];
  if (adults != null) parts.push(`${adults} người lớn`);
  if (children != null) parts.push(`${children} trẻ em`);
  return parts.length ? parts.join(" · ") : "Chưa cập nhật";
}

export default function BookingsPage() {
  const location = useLocation();
  const { user } = useAuth();
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
  const [chatBooking, setChatBooking] = useState(null);
  const [chatByBooking, setChatByBooking] = useState({});
  const [refundByBooking, setRefundByBooking] = useState({});
  const [refundBooking, setRefundBooking] = useState(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundProofUrl, setRefundProofUrl] = useState("");
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState(null);
  const [refundForm, setRefundForm] = useState({
    reasonCode: "CANNOT_ARRIVE",
    note: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
  });

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

  const loadChatSummaries = useCallback(async () => {
    try {
      const conversations = await getCustomerConversations();
      setChatByBooking(
        Object.fromEntries(
          conversations
            .filter((conversation) => conversation?.bookingId)
            .map((conversation) => [String(conversation.bookingId), conversation]),
        ),
      );
    } catch {
      // Chat service có thể chưa khởi động; không được làm hỏng trang booking.
      setChatByBooking({});
    }
  }, []);

  const loadBookings = useCallback(async () => {
    if (!customerId) {
      setLoading(false);
      setError("Không xác định được tài khoản để tải đơn đặt phòng.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [data, reviewData, refundData] = await Promise.all([
        getMyBookings(customerId),
        getMyReviews().catch(() => []),
        getMyRefundRequests().catch(() => []),
      ]);
      const normalized = Array.isArray(data) ? data : [];
      const normalizedReviews = Array.isArray(reviewData) ? reviewData : [];
      const normalizedRefunds = Array.isArray(refundData) ? refundData : [];

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
      await Promise.all([
        loadMetadata(normalized),
        loadChatSummaries(),
      ]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải danh sách đơn đặt phòng.",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, loadChatSummaries, loadMetadata]);

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

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
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

  const handleConversationUpdated = useCallback((conversation) => {
    if (!conversation?.bookingId) return;

    const bookingId = String(conversation.bookingId);

    setChatByBooking((current) => {
      const previous = current[bookingId];

      if (
        previous?.id === conversation.id &&
        previous?.unreadCount === conversation.unreadCount &&
        previous?.arrivalStatus === conversation.arrivalStatus &&
        previous?.expectedArrivalTime === conversation.expectedArrivalTime &&
        previous?.humanTakeover === conversation.humanTakeover &&
        previous?.lastMessageAt === conversation.lastMessageAt
      ) {
        return current;
      }

      return {
        ...current,
        [bookingId]: {
          ...(previous ?? {}),
          ...conversation,
        },
      };
    });
  }, []);

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
        requestError.response?.data?.message ?? "Không thể hủy booking.",
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
          ?? "Không thể ẩn booking khỏi danh sách.",
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
            <h1>Booking của tôi</h1>
            <p>
              Theo dõi chuyến đi, thanh toán, nhận QR check-in và quản lý các đơn đã đặt.
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
            <div><small>Tổng booking</small><strong>{summary.total}</strong></div>
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
                          onClick={() => setChatBooking(booking)}
                        >
                          <MessageCircle size={17} />
                          <span>
                            Chat với khách sạn
                            {Number(chatByBooking[String(booking.id)]?.unreadCount ?? 0) > 0 ? (
                              <b className="booking-v2-chat-unread">
                                {Math.min(99, Number(chatByBooking[String(booking.id)]?.unreadCount))}
                              </b>
                            ) : null}
                          </span>
                        </button>
                      ) : null}

                      {canContinuePayment(booking) ? (
                        <button
                          type="button"
                          className="booking-v2-pay-action"
                          disabled={working}
                          onClick={() => void handlePayAgain(booking)}
                        >
                          <CreditCard size={17} />
                          Thanh toán tiếp
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
                          Hủy booking
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

      {selectedBooking ? (
        <div
          className="booking-v2-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <section
            className="booking-v2-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Chi tiết booking"
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
                  <div><span>Tổng booking</span><strong>{money(selectedBooking.totalPrice)}</strong></div>
                  <div><span>Đã thanh toán</span><strong className="paid">{money(selectedBooking.paidAmount)}</strong></div>
                  <div><span>Còn phải thanh toán</span><strong className="remaining">{money(selectedBooking.remainingAmount)}</strong></div>
                </div>

                {selectedBooking.specialRequest ? (
                  <div className="booking-v2-special-request">
                    <strong>Yêu cầu đặc biệt</strong>
                    <p>{selectedBooking.specialRequest}</p>
                  </div>
                ) : null}
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

                <Link to={`/hotels/${selectedBooking.hotelId}`} onClick={closeDetails}>
                  Xem khách sạn
                  <ChevronRight size={16} />
                </Link>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

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
            aria-label="Yêu cầu hoàn tiền booking"
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
          : "Đơn sẽ được ẩn khỏi danh sách của bạn nhưng vẫn được lưu trong hệ thống để tra cứu khi cần."}
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

      {chatBooking ? (
        <CustomerHotelChat
          open
          booking={chatBooking}
          hotel={metadata[chatBooking.id]?.hotel}
          onClose={() => {
            setChatBooking(null);
            void loadChatSummaries();
          }}
          onConversationUpdated={handleConversationUpdated}
        />
      ) : null}

      {reviewBooking ? (
        <ReviewFormModal
          booking={reviewBooking}
          hotel={metadata[reviewBooking.id]?.hotel}
          roomType={metadata[reviewBooking.id]?.roomType}
          onClose={() => setReviewBooking(null)}
          onSubmitted={handleReviewSubmitted}
        />
      ) : null}
    </main>
  );
}
