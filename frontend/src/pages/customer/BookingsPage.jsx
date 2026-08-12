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
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import ReviewFormModal from "../../components/review/ReviewFormModal";
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
import { createPayOsCheckout } from "../../services/paymentService";
import { scrollToHashTarget } from "../../utils/notificationNavigation";
import "./BookingsPage.css";

const FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "PAYMENT", label: "Chờ thanh toán" },
  { value: "UPCOMING", label: "Sắp tới" },
  { value: "STAYING", label: "Đang lưu trú" },
  { value: "COMPLETED", label: "Đã hoàn tất" },
  { value: "CANCELLED", label: "Đã hủy" },
];

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function formatDate(value) {
  if (!value) return "--";

  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value, fallback) {
  if (!value) return fallback;
  return String(value).slice(0, 5);
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function paymentOptionLabel(value, depositPercent) {
  if (value === "PAY_AT_HOTEL") return "Thanh toán tại khách sạn";
  if (value === "DEPOSIT") return `Đặt cọc ${depositPercent ?? 30}%`;
  if (value === "FULL_PAYMENT") return "Thanh toán toàn bộ";
  return value ?? "Chưa xác định";
}

function statusLabel(value) {
  return (
    {
      PENDING: "Chờ xác nhận",
      PENDING_PAYMENT: "Chờ thanh toán",
      CONFIRMED: "Đã xác nhận",
      CHECKED_IN: "Đang lưu trú",
      CHECKED_OUT: "Đã trả phòng",
      CANCELLED: "Đã hủy",
    }[value] ?? value
  );
}

function statusTone(value) {
  if (value === "CONFIRMED") return "confirmed";
  if (value === "CHECKED_IN") return "staying";
  if (value === "CHECKED_OUT") return "completed";
  if (value === "CANCELLED") return "cancelled";
  return "pending";
}

function paymentStatusLabel(value, booking = null) {
  if (value === "PARTIALLY_PAID") {
    // Chỉ gọi là "Đã đặt cọc" khi booking thực sự chọn hình thức đặt cọc.
    if (booking?.paymentOption === "DEPOSIT") {
      return `Đã đặt cọc ${booking.depositPercent ?? 30}%`;
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
    }[value] ?? value
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
      && !["CANCELLED", "CHECKED_OUT"].includes(booking.status);
  }

  if (filter === "UPCOMING") {
    return ["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(booking.status);
  }

  if (filter === "STAYING") return booking.status === "CHECKED_IN";
  if (filter === "COMPLETED") return booking.status === "CHECKED_OUT";
  if (filter === "CANCELLED") return booking.status === "CANCELLED";
  return true;
}

function canHideBooking(booking) {
  return ["CANCELLED", "CHECKED_OUT"].includes(booking.status);
}

function canCancelBooking(booking) {
  return !["CANCELLED", "CHECKED_IN", "CHECKED_OUT"].includes(booking.status);
}

function canContinuePayment(booking) {
  return booking.paymentOption !== "PAY_AT_HOTEL"
    && Number(booking.remainingAmount ?? 0) > 0
    && ["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)
    && booking.paymentStatus !== "PAID";
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
    if (!customerId) return;

    setLoading(true);
    setError("");

    try {
      const [data, reviewData] = await Promise.all([
        getMyBookings(customerId),
        getMyReviews().catch(() => []),
      ]);
      const normalized = Array.isArray(data) ? data : [];
      const normalizedReviews = Array.isArray(reviewData) ? reviewData : [];

      setBookings(normalized);
      setReviewsByBooking(
        Object.fromEntries(
          normalizedReviews.map((review) => [review.bookingId, review]),
        ),
      );
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

  const filteredBookings = useMemo(
    () => bookings.filter((booking) => bookingMatchesFilter(booking, filter)),
    [bookings, filter],
  );

  const summary = useMemo(() => ({
    total: bookings.length,
    upcoming: bookings.filter((booking) =>
      ["PENDING", "PENDING_PAYMENT", "CONFIRMED"].includes(booking.status),
    ).length,
    staying: bookings.filter((booking) => booking.status === "CHECKED_IN").length,
    remaining: bookings.reduce(
      (total, booking) => total + Number(booking.remainingAmount ?? 0),
      0,
    ),
  }), [bookings]);

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
    const accepted = window.confirm(
      `Bạn có chắc muốn hủy booking ${booking.bookingCode}?`,
    );
    if (!accepted) return;

    setWorkingId(booking.id);
    setError("");

    try {
      await cancelBooking(booking.id);
      await loadBookings();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ?? "Không thể hủy booking.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function handleHide(booking) {
    const accepted = window.confirm(
      "Ẩn đơn này khỏi danh sách của bạn? Dữ liệu vẫn được hệ thống lưu để đối soát.",
    );
    if (!accepted) return;

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

        <section className="booking-v2-summary">
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
        </section>

        <ErrorMessage message={error} />

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

          <div className="booking-v2-filters" role="tablist">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "active" : ""}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="booking-v2-empty">
              <Hotel size={48} />
              <h2>Chưa có đơn phù hợp</h2>
              <p>Thử chọn trạng thái khác hoặc tìm một khách sạn cho chuyến đi mới.</p>
              <Link to="/hotels">Tìm khách sạn</Link>
            </div>
          ) : (
            <div className="booking-v2-list">
              {filteredBookings.map((booking) => {
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
                        <img src={coverUrl} alt={hotel?.name ?? "Khách sạn"} />
                      ) : (
                        <div className="booking-v2-cover-empty">
                          <ImageOff size={34} />
                          <span>Chưa có ảnh khách sạn</span>
                        </div>
                      )}

                      <span className={`booking-v2-status ${statusTone(booking.status)}`}>
                        {statusLabel(booking.status)}
                      </span>
                    </div>

                    <div className="booking-v2-main">
                      <div className="booking-v2-title-row">
                        <div>
                          <span className="booking-v2-code">
                            {booking.bookingCode ?? booking.id}
                          </span>
                          <h3>{hotel?.name ?? "Khách sạn EnziuRooms"}</h3>
                          <p>
                            <MapPin size={15} />
                            {hotel?.city ?? hotel?.address ?? "Thông tin địa điểm đang cập nhật"}
                          </p>
                        </div>

                        <span className={`booking-v2-payment-state ${booking.paymentStatus?.toLowerCase()}`}>
                          {paymentStatusLabel(booking.paymentStatus, booking)}
                        </span>
                      </div>

                      <div className="booking-v2-facts">
                        <div>
                          <CalendarDays size={17} />
                          <span>Nhận phòng từ {formatTime(hotel?.checkInTime, "14:00")}</span>
                          <strong>{formatDate(booking.checkIn)}</strong>
                        </div>
                        <div>
                          <CalendarDays size={17} />
                          <span>Trả phòng trước {formatTime(hotel?.checkOutTime, "12:00")}</span>
                          <strong>{formatDate(booking.checkOut)}</strong>
                        </div>
                        <div>
                          <BedDouble size={17} />
                          <span>Phòng</span>
                          <strong>{roomType?.name ?? room?.roomNumber ?? "Đang cập nhật"}</strong>
                        </div>
                        <div>
                          <Users size={17} />
                          <span>Khách</span>
                          <strong>{booking.adults ?? 1} người lớn · {booking.children ?? 0} trẻ em</strong>
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
                          onClick={() => void handleCancel(booking)}
                        >
                          <XCircle size={17} />
                          Hủy booking
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
                          onClick={() => void handleHide(booking)}
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
                <h2>{selectedBooking.bookingCode}</h2>
                <p>Đặt lúc {formatDateTime(selectedBooking.createdAt)}</p>
              </div>
              <span className={`booking-v2-status ${statusTone(selectedBooking.status)}`}>
                {statusLabel(selectedBooking.status)}
              </span>
            </div>

            <div className="booking-v2-modal-grid">
              <div className="booking-v2-modal-details">
                <article className="booking-v2-modal-hotel">
                  <span><Building2 size={22} /></span>
                  <div>
                    <small>Khách sạn</small>
                    <h3>{metadata[selectedBooking.id]?.hotel?.name ?? "Khách sạn EnziuRooms"}</h3>
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
                    <span>Nhận phòng từ {formatTime(metadata[selectedBooking.id]?.hotel?.checkInTime, "14:00")}</span>
                    <strong>{formatDate(selectedBooking.checkIn)}</strong>
                  </div>
                  <div>
                    <CalendarDays size={18} />
                    <span>Trả phòng trước {formatTime(metadata[selectedBooking.id]?.hotel?.checkOutTime, "12:00")}</span>
                    <strong>{formatDate(selectedBooking.checkOut)}</strong>
                  </div>
                  <div>
                    <Clock3 size={18} />
                    <span>Thời gian lưu trú</span>
                    <strong>{nightsBetween(selectedBooking.checkIn, selectedBooking.checkOut)} đêm</strong>
                  </div>
                  <div>
                    <Users size={18} />
                    <span>Khách lưu trú</span>
                    <strong>{selectedBooking.adults ?? 1} người lớn · {selectedBooking.children ?? 0} trẻ em</strong>
                  </div>
                  <div>
                    <BedDouble size={18} />
                    <span>Loại phòng</span>
                    <strong>{metadata[selectedBooking.id]?.roomType?.name ?? "Đang cập nhật"}</strong>
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

                <p>Đưa mã này cho Hotel Admin khi đến nhận phòng.</p>

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