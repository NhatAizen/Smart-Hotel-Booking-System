import {
  ArrowRightLeft,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Eye,
  Hotel,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, StatusBadge } from "../../components/ui";
import {
  approveRoomChangeRequest,
  getHotelBookings,
  getHotelRoomChangeRequests,
  getRoomChangeQuote,
  markBookingNoShow,
  rejectRoomChangeRequest,
} from "../../services/bookingService";
import {
  getManagedRooms,
  getMyHotels,
  getRoomTypes,
} from "../../services/hotelAdminService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import "../shared/BookingManagementPage.css";

const FILTERS = [
  ["ALL", "Tất cả"],
  ["CONFIRMED", "Đã xác nhận"],
  ["PENDING_PAYMENT", "Chờ thanh toán"],
  ["CHECKED_IN", "Đang lưu trú"],
  ["CHECKED_OUT", "Đã hoàn tất"],
  ["NO_SHOW", "Không đến"],
  ["CANCELLED", "Đã hủy"],
];

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN").format(parsed);
}

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
}

function customerName(booking) {
  const value = [booking?.bookerLastName, booking?.bookerFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return value || booking?.bookerEmail || "Khách hàng";
}

function paymentLabel(value) {
  return {
    UNPAID: "Chưa thanh toán",
    PARTIALLY_PAID: "Đã thanh toán một phần",
    PAID: "Đã thanh toán đủ",
    REFUNDED: "Đã hoàn tiền",
    FAILED: "Thanh toán thất bại",
  }[value] ?? value ?? "—";
}

function requestStatusLabel(value) {
  return {
    PENDING: "Chờ xử lý",
    APPROVED: "Đã duyệt",
    REJECTED: "Đã từ chối",
  }[value] ?? value;
}

function requestTone(value) {
  if (value === "APPROVED") return "success";
  if (value === "REJECTED") return "danger";
  return "warning";
}

function messageOf(error, fallback) {
  return error?.response?.data?.message
    ?? error?.response?.data?.error
    ?? error?.message
    ?? fallback;
}

function resolveImageUrl(image) {
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
  const images = Array.isArray(roomType.images) ? roomType.images : [];
  const preferred = images.find((image) => image?.cover || image?.isCover || image?.primary) ?? images[0];
  return resolveImageUrl(roomType.coverImageUrl)
    || resolveImageUrl(roomType.imageUrl)
    || resolveImageUrl(roomType.coverImage)
    || resolveImageUrl(preferred);
}

function customerInitials(booking) {
  const name = customerName(booking);
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function paymentProgress(booking) {
  const total = Number(booking?.totalPrice ?? 0);
  const paid = Number(booking?.paidAmount ?? 0);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid)) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

export default function HotelBookingsPage() {
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState("");
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [reviewRequest, setReviewRequest] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const hotelData = await getMyHotels();
      const normalized = Array.isArray(hotelData) ? hotelData : [];
      setHotels(normalized);
      setHotelId((current) => (
        normalized.some((item) => String(item.id) === String(current))
          ? current
          : normalized[0]?.id ?? ""
      ));
    } catch (requestError) {
      setError(messageOf(requestError, "Không thể tải khách sạn đang quản lý."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHotelData = useCallback(async () => {
    if (!hotelId) {
      setBookings([]);
      setRequests([]);
      setRooms([]);
      setRoomTypes([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [bookingData, requestData, roomData, roomTypeData] = await Promise.all([
        getHotelBookings(hotelId),
        getHotelRoomChangeRequests(hotelId),
        getManagedRooms(hotelId),
        getRoomTypes(hotelId),
      ]);
      setBookings(Array.isArray(bookingData) ? bookingData : []);
      setRequests(Array.isArray(requestData) ? requestData : []);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setRoomTypes(Array.isArray(roomTypeData) ? roomTypeData : []);
    } catch (requestError) {
      setError(messageOf(requestError, "Không thể tải danh sách booking của khách sạn."));
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadHotelData(); }, [loadHotelData]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);
  useRealtimeRefresh(["NOTIFICATION_CREATED", "AVAILABILITY_CHANGED"], loadHotelData, { debounceMs: 180 });

  const bookingMap = useMemo(
    () => Object.fromEntries(bookings.map((booking) => [String(booking.id), booking])),
    [bookings],
  );
  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [String(type.id), type])),
    [roomTypes],
  );
  const roomMap = useMemo(
    () => Object.fromEntries(rooms.map((room) => [String(room.id), room])),
    [rooms],
  );

  const pendingRequests = useMemo(
    () => requests.filter((item) => item.status === "PENDING"),
    [requests],
  );

  const filteredBookings = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (filter !== "ALL" && booking.status !== filter) return false;
      if (!keyword) return true;
      return [
        booking.bookingCode,
        booking.bookerFirstName,
        booking.bookerLastName,
        booking.bookerEmail,
        booking.bookerPhone,
        roomMap[String(booking.roomId)]?.roomNumber,
        roomTypeMap[String(booking.roomTypeId)]?.name,
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
    });
  }, [bookings, filter, query, roomMap, roomTypeMap]);

  const stats = useMemo(() => ({
    total: bookings.length,
    upcoming: bookings.filter((item) => ["CONFIRMED", "PENDING_PAYMENT"].includes(item.status)).length,
    staying: bookings.filter((item) => item.status === "CHECKED_IN").length,
    roomChanges: pendingRequests.length,
  }), [bookings, pendingRequests]);

  async function openRoomChange(request) {
    const booking = bookingMap[String(request.bookingId)];
    if (!booking) return;
    setReviewRequest(request);
    setReviewNote("");
    setQuote(null);
    setError("");
    if (!request.targetRoomId) {
      setError("Yêu cầu cũ này chưa có phòng Customer lựa chọn. Hãy từ chối và yêu cầu Customer gửi lại.");
      return;
    }
    setQuoteLoading(true);
    try {
      setQuote(await getRoomChangeQuote(request.id));
    } catch (requestError) {
      setError(messageOf(
        requestError,
        "Phòng Customer chọn hiện không còn phù hợp hoặc không còn trống. Bạn có thể từ chối yêu cầu để Customer chọn lại phòng khác.",
      ));
    } finally {
      setQuoteLoading(false);
    }
  }

  async function approveChange() {
    if (!reviewRequest || !reviewRequest.targetRoomId || !quote || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await approveRoomChangeRequest(reviewRequest.id, reviewNote);
      setMessage("Đã duyệt đúng phòng Customer yêu cầu. Booking và số tiền cần thanh toán đã được cập nhật.");
      setReviewRequest(null);
      await loadHotelData();
    } catch (requestError) {
      setError(messageOf(requestError, "Không thể duyệt yêu cầu đổi phòng."));
    } finally {
      setBusy(false);
    }
  }

  async function rejectChange() {
    if (!reviewRequest || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rejectRoomChangeRequest(reviewRequest.id, reviewNote);
      setMessage("Đã từ chối yêu cầu đổi phòng.");
      setReviewRequest(null);
      await loadHotelData();
    } catch (requestError) {
      setError(messageOf(requestError, "Không thể từ chối yêu cầu đổi phòng."));
    } finally {
      setBusy(false);
    }
  }

  async function handleNoShow(booking) {
    if (!window.confirm(`Đánh dấu booking ${booking.bookingCode} là khách không đến?`)) return;
    setBusy(true);
    setError("");
    try {
      await markBookingNoShow(booking.id);
      setMessage(`Đã đánh dấu ${booking.bookingCode} là không đến.`);
      await loadHotelData();
    } catch (requestError) {
      setError(messageOf(requestError, "Chưa đủ điều kiện đánh dấu khách không đến."));
    } finally {
      setBusy(false);
    }
  }

  if (loading && hotels.length === 0) return <Loading message="Đang tải quản lý booking..." />;

  const selectedHotel = hotels.find((hotel) => String(hotel.id) === String(hotelId));
  const reviewBooking = reviewRequest ? bookingMap[String(reviewRequest.bookingId)] : null;

  return (
    <section className="booking-management-page hotel-booking-management">
      <header className="booking-management-hero">
        <div>
          <span className="booking-management-eyebrow">VẬN HÀNH KHÁCH SẠN</span>
          <h1>Quản lý đơn đặt phòng</h1>
          <p>Theo dõi booking của khách, thanh toán, no-show và xử lý yêu cầu đổi phòng trên dữ liệu thật.</p>
        </div>
        <div className="booking-management-hero-actions">
          <select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select>
          <button type="button" onClick={() => void loadHotelData()}><RefreshCw size={17} /> Làm mới</button>
        </div>
      </header>

      <ErrorMessage message={error} onRetry={() => void loadHotelData()} />
      {message ? (
        <div className="booking-management-toast" role="status" aria-live="polite">
          <span className="booking-management-toast-icon"><CheckCircle2 size={19} /></span>
          <div>
            <strong>Đã cập nhật thành công</strong>
            <p>{message}</p>
          </div>
          <button type="button" onClick={() => setMessage("")} aria-label="Đóng thông báo"><X size={17} /></button>
        </div>
      ) : null}

      <div className="booking-management-stats">
        <article><Hotel size={20} /><div><small>Tổng booking</small><strong>{stats.total}</strong></div></article>
        <article><CalendarDays size={20} /><div><small>Sắp tới</small><strong>{stats.upcoming}</strong></div></article>
        <article><BedDouble size={20} /><div><small>Đang lưu trú</small><strong>{stats.staying}</strong></div></article>
        <article className={stats.roomChanges > 0 ? "attention" : ""}><ArrowRightLeft size={20} /><div><small>Yêu cầu đổi phòng</small><strong>{stats.roomChanges}</strong></div></article>
      </div>

      {pendingRequests.length > 0 ? (
        <section className="room-change-queue">
          <div className="booking-management-section-title">
            <div><span>ĐỔI PHÒNG</span><h2>Yêu cầu đang chờ xử lý</h2></div>
            <b>{pendingRequests.length} yêu cầu</b>
          </div>
          <div className="room-change-queue-grid">
            {pendingRequests.map((request) => {
              const booking = bookingMap[String(request.bookingId)];
              if (!booking) return null;
              const room = roomMap[String(booking.roomId)];
              const type = roomTypeMap[String(booking.roomTypeId)];
              return (
                <article key={request.id} className="room-change-request-card">
                  <div className="room-change-request-head">
                    <StatusBadge status="PENDING" label="Chờ xử lý" tone="warning" size="sm" />
                    <span>{dateTime(request.requestedAt)}</span>
                  </div>
                  <strong>{booking.bookingCode}</strong>
                  <h3>{customerName(booking)}</h3>
                  <p className="room-change-current-room"><BedDouble size={16} /> Phòng hiện tại: {type?.name ?? "Loại phòng"} · {room?.roomNumber ?? "—"}</p>
                  {request.targetRoomId ? (() => {
                    const requestedRoom = roomMap[String(request.targetRoomId)];
                    const requestedType = requestedRoom ? roomTypeMap[String(requestedRoom.roomTypeId)] : null;
                    return <p className="room-change-current-room requested"><ArrowRightLeft size={16} /> Khách muốn: {requestedType?.name ?? "Loại phòng"} · {requestedRoom?.roomNumber ?? "—"}</p>;
                  })() : null}
                  <blockquote>{request.reason}</blockquote>
                  <button type="button" onClick={() => void openRoomChange(request)}><ArrowRightLeft size={17} /> Xem xét đổi phòng</button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="booking-management-panel">
        <div className="booking-management-toolbar">
          <div className="booking-management-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã booking, tên khách, phòng..." /></div>
          <div className="booking-management-filter-list">
            {FILTERS.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <EmptyState icon={<CalendarDays size={30} />} title="Chưa có booking phù hợp" description={`Không có đơn phù hợp tại ${selectedHotel?.name ?? "khách sạn"}.`} />
        ) : (
          <div className="hotel-booking-card-list">
            {filteredBookings.map((booking) => {
              const room = roomMap[String(booking.roomId)];
              const type = roomTypeMap[String(booking.roomTypeId)];
              const progress = paymentProgress(booking);
              const roomImage = roomTypeCover(type);
              const hasRoomChange = pendingRequests.some((request) => String(request.bookingId) === String(booking.id));
              const contact = booking.bookerPhone ?? booking.bookerEmail ?? "Chưa có thông tin liên hệ";
              return (
                <article key={booking.id} className={`hotel-booking-card${hasRoomChange ? " has-room-change" : ""}`}>
                  <div className="hotel-booking-card-head">
                    <div className="hotel-booking-customer">
                      <span className="hotel-booking-avatar">{customerInitials(booking)}</span>
                      <div>
                        <div className="hotel-booking-customer-name-line">
                          <h3>{customerName(booking)}</h3>
                          {hasRoomChange ? <span className="hotel-booking-room-change-chip"><ArrowRightLeft size={13} /> Yêu cầu đổi phòng</span> : null}
                        </div>
                        <p>{booking.bookingCode}</p>
                        <small>{contact}</small>
                      </div>
                    </div>
                    <div className="hotel-booking-card-status">
                      <StatusBadge status={booking.status} size="sm" />
                    </div>
                  </div>

                  <div className="hotel-booking-card-body">
                    <div className="hotel-booking-room-highlight">
                      <div className="hotel-booking-room-photo">
                        <span className="hotel-booking-room-photo-placeholder"><BedDouble size={25} /></span>
                        {roomImage ? (
                          <img
                            src={roomImage}
                            alt={type?.name ? `Phòng ${type.name}` : "Ảnh phòng"}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                          />
                        ) : null}
                        <b>Phòng {room?.roomNumber ?? "—"}</b>
                      </div>
                      <div className="hotel-booking-room-copy">
                        <small>Phòng khách đã đặt</small>
                        <strong>{type?.name ?? "Chưa xác định loại phòng"}</strong>
                        <div className="hotel-booking-room-meta">
                          <span><BedDouble size={14} /> Số phòng <b>{room?.roomNumber ?? "—"}</b></span>
                          {room?.floor != null ? <span>Tầng <b>{room.floor}</b></span> : null}
                        </div>
                        <p>{room?.status ? String(room.status).replaceAll("_", " ") : "Thông tin phòng theo dữ liệu khách sạn"}</p>
                      </div>
                    </div>
                    <div className="hotel-booking-info-tile">
                      <span><CalendarDays size={17} /></span>
                      <div><small>Kỳ lưu trú</small><strong>{date(booking.checkIn)} → {date(booking.checkOut)}</strong><p>{booking.adults ?? 0} người lớn · {booking.children ?? 0} trẻ em</p></div>
                    </div>
                    <div className="hotel-booking-payment-tile">
                      <div className="hotel-booking-payment-top">
                        <div><small>Tổng tiền</small><strong>{money(booking.totalPrice)}</strong></div>
                        <span>{paymentLabel(booking.paymentStatus)}</span>
                      </div>
                      <div className="hotel-booking-payment-bar" aria-label={`Đã thanh toán ${progress}%`}>
                        <i style={{ width: `${progress}%` }} />
                      </div>
                      <div className="hotel-booking-payment-bottom">
                        <small>Đã trả <b>{money(booking.paidAmount)}</b></small>
                        <small>Còn lại <b>{money(booking.remainingAmount)}</b></small>
                      </div>
                    </div>
                  </div>

                  <footer className="hotel-booking-card-footer">
                    <div className="hotel-booking-created">
                      <Clock3 size={14} />
                      <span>Cập nhật {dateTime(booking.updatedAt ?? booking.createdAt)}</span>
                    </div>
                    <div className="hotel-booking-actions">
                      <button type="button" className="secondary" onClick={() => setSelectedBooking(booking)}><Eye size={16} /> Xem chi tiết</button>
                      {booking.status === "CONFIRMED" ? (
                        <button type="button" className="danger" onClick={() => void handleNoShow(booking)} disabled={busy}><XCircle size={16} /> Không đến</button>
                      ) : null}
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedBooking ? (
        <div className="booking-management-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedBooking(null)}>
          <section className="booking-management-modal" role="dialog" aria-modal="true">
            <button className="booking-management-modal-close" onClick={() => setSelectedBooking(null)}><X size={20} /></button>
            <span className="booking-management-eyebrow">CHI TIẾT BOOKING</span>
            <h2>{selectedBooking.bookingCode}</h2>
            <div className="booking-management-detail-grid">
              <div><UserRound size={18} /><small>Khách hàng</small><strong>{customerName(selectedBooking)}</strong><span>{selectedBooking.bookerPhone ?? selectedBooking.bookerEmail ?? "—"}</span></div>
              <div className="booking-management-detail-room">
                {roomTypeCover(roomTypeMap[String(selectedBooking.roomTypeId)]) ? (
                  <img src={roomTypeCover(roomTypeMap[String(selectedBooking.roomTypeId)])} alt="Ảnh phòng" />
                ) : <BedDouble size={18} />}
                <small>Phòng</small>
                <strong>{roomTypeMap[String(selectedBooking.roomTypeId)]?.name ?? "—"}</strong>
                <span>Phòng {roomMap[String(selectedBooking.roomId)]?.roomNumber ?? "—"}</span>
              </div>
              <div><CalendarDays size={18} /><small>Lưu trú</small><strong>{date(selectedBooking.checkIn)} → {date(selectedBooking.checkOut)}</strong></div>
              <div><CreditCard size={18} /><small>Thanh toán</small><strong>{paymentLabel(selectedBooking.paymentStatus)}</strong><span>Còn {money(selectedBooking.remainingAmount)}</span></div>
              <div><CircleDollarSign size={18} /><small>Tổng tiền</small><strong>{money(selectedBooking.totalPrice)}</strong><span>Đã trả {money(selectedBooking.paidAmount)}</span></div>
              <div><ShieldCheck size={18} /><small>Trạng thái</small><strong>{selectedBooking.status}</strong></div>
            </div>
            <div className="booking-management-modal-actions">
              <Link to="/hotel-admin/check-in">Mở quầy nhận phòng</Link>
              <Link to="/hotel-admin/current-stays">Khách đang lưu trú</Link>
            </div>
          </section>
        </div>
      ) : null}

      {reviewRequest && reviewBooking ? (
        <div className="booking-management-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setReviewRequest(null)}>
          <section className="booking-management-modal room-change-review-modal" role="dialog" aria-modal="true">
            <button className="booking-management-modal-close" onClick={() => setReviewRequest(null)}><X size={20} /></button>
            <span className="booking-management-eyebrow">XÉT DUYỆT ĐỔI PHÒNG</span>
            <h2>{reviewBooking.bookingCode}</h2>
            <p>Khách <strong>{customerName(reviewBooking)}</strong>: “{reviewRequest.reason}”</p>

            <div className="room-change-old-summary">
              <div><small>Phòng hiện tại</small><strong>{roomTypeMap[String(reviewBooking.roomTypeId)]?.name ?? "—"} · {roomMap[String(reviewBooking.roomId)]?.roomNumber ?? "—"}</strong></div>
              <div><small>Giá booking hiện tại</small><strong>{money(reviewBooking.totalPrice)}</strong></div>
              <div><small>Đã thanh toán</small><strong>{money(reviewBooking.paidAmount)}</strong></div>
            </div>

            {reviewRequest.targetRoomId ? (() => {
              const requestedRoom = roomMap[String(reviewRequest.targetRoomId)];
              const requestedType = requestedRoom ? roomTypeMap[String(requestedRoom.roomTypeId)] : null;
              const nightlyPrice = requestedRoom?.customPrice ?? requestedType?.basePrice;
              return (
                <div className="room-change-customer-choice">
                  <small>PHÒNG CUSTOMER YÊU CẦU</small>
                  <strong>{requestedType?.name ?? "Loại phòng"} · phòng {requestedRoom?.roomNumber ?? "—"}</strong>
                  <span>{nightlyPrice != null ? `${money(nightlyPrice)}/đêm` : "Giá sẽ được hệ thống tính lại"}</span>
                  <p>Hotel Admin chỉ duyệt hoặc từ chối đúng phòng này, không tự đổi sang phòng khác.</p>
                </div>
              );
            })() : (
              <div className="room-change-customer-choice is-error">Yêu cầu cũ chưa có phòng Customer lựa chọn.</div>
            )}

            {quoteLoading ? <div className="room-change-quote-loading"><Clock3 size={17} /> Đang tính lại giá...</div> : null}
            {quote ? (
              <div className="room-change-quote">
                <div><small>Phòng mới</small><strong>{quote.targetRoomTypeName} · {quote.targetRoomNumber}</strong></div>
                <div><small>Tổng cũ</small><strong>{money(quote.oldTotalPrice)}</strong></div>
                <div><small>Tổng mới</small><strong>{money(quote.newTotalPrice)}</strong></div>
                <div><small>Chênh lệch</small><strong className={Number(quote.priceDifference) > 0 ? "danger" : "success"}>{money(quote.priceDifference)}</strong></div>
                <div className="room-change-payment-due"><small>Khách cần thanh toán bổ sung ngay</small><strong>{money(quote.additionalPaymentDue)}</strong><span>{quote.paymentOption === "DEPOSIT" ? `Bù đến mức cọc ${quote.depositPercent ?? 0}% của phòng mới` : quote.paymentOption === "FULL_PAYMENT" ? "Thanh toán phần chênh lệch còn thiếu" : "Thanh toán tại khách sạn theo booking"}</span></div>
              </div>
            ) : null}

            <label className="booking-management-field"><span>Ghi chú cho khách</span><textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Ví dụ: Khách sạn đã giữ phòng Deluxe 305 cho bạn..." /></label>

            <div className="room-change-review-actions">
              <button type="button" className="reject" disabled={busy} onClick={() => void rejectChange()}><XCircle size={17} /> Từ chối</button>
              <button type="button" className="approve" disabled={busy || !quote || !reviewRequest.targetRoomId} onClick={() => void approveChange()}><CheckCircle2 size={17} /> Duyệt đúng phòng khách chọn</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
