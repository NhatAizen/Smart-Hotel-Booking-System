import {
  BedDouble,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Eye,
  Hotel,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, StatusBadge } from "../../components/ui";
import { getSystemBookings } from "../../services/bookingService";
import { getHotelById, getRoomById, getRoomTypeById } from "../../services/hotelService";
import "../shared/BookingManagementPage.css";

const FILTERS = [
  ["ALL", "Tất cả"],
  ["PENDING_PAYMENT", "Chờ thanh toán"],
  ["CONFIRMED", "Đã xác nhận"],
  ["CHECKED_IN", "Đang lưu trú"],
  ["CHECKED_OUT", "Đã hoàn tất"],
  ["NO_SHOW", "Không đến"],
  ["CANCELLED", "Đã hủy"],
];

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${Math.round(number).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`
    : "—";
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN").format(parsed);
}

function customerName(booking) {
  return [booking?.bookerLastName, booking?.bookerFirstName].filter(Boolean).join(" ").trim()
    || booking?.bookerEmail
    || "Khách hàng";
}

function customerInitials(booking) {
  const parts = customerName(booking).split(/\s+/).filter(Boolean);
  if (!parts.length) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
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

function paymentProgress(booking) {
  const total = Number(booking?.totalPrice ?? 0);
  const paid = Number(booking?.paidAmount ?? 0);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid)) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

function messageOf(error, fallback) {
  return error?.response?.data?.message ?? error?.message ?? fallback;
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

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [hotelFilter, setHotelFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getSystemBookings();
      const values = Array.isArray(payload) ? payload : [];
      setBookings(values);

      const hotelIds = [...new Set(values.map((item) => item.hotelId).filter(Boolean).map(String))];
      const roomIds = [...new Set(values.map((item) => item.roomId).filter(Boolean).map(String))];
      const typeIds = [...new Set(values.map((item) => item.roomTypeId).filter(Boolean).map(String))];

      const [hotels, rooms, roomTypes] = await Promise.all([
        Promise.all(hotelIds.map(async (id) => {
          try { return [id, await getHotelById(id)]; } catch { return [id, null]; }
        })),
        Promise.all(roomIds.map(async (id) => {
          try { return [id, await getRoomById(id)]; } catch { return [id, null]; }
        })),
        Promise.all(typeIds.map(async (id) => {
          try { return [id, await getRoomTypeById(id)]; } catch { return [id, null]; }
        })),
      ]);

      const hotelMap = Object.fromEntries(hotels);
      const roomMap = Object.fromEntries(rooms);
      const roomTypeMap = Object.fromEntries(roomTypes);
      setMetadata(Object.fromEntries(values.map((booking) => [String(booking.id), {
        hotel: hotelMap[String(booking.hotelId)] ?? null,
        room: roomMap[String(booking.roomId)] ?? null,
        roomType: roomTypeMap[String(booking.roomTypeId)] ?? null,
      }])));
    } catch (requestError) {
      setError(messageOf(requestError, "Không thể tải booking toàn hệ thống."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hotelOptions = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      if (!booking.hotelId) return;
      const meta = metadata[String(booking.id)] ?? {};
      map.set(String(booking.hotelId), meta.hotel?.name ?? `Khách sạn ${String(booking.hotelId).slice(0, 8)}`);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [bookings, metadata]);

  useEffect(() => {
    if (hotelFilter !== "ALL" && !hotelOptions.some((item) => item.id === hotelFilter)) {
      setHotelFilter("ALL");
    }
  }, [hotelFilter, hotelOptions]);

  const scopedBookings = useMemo(
    () => bookings.filter((booking) => hotelFilter === "ALL" || String(booking.hotelId) === hotelFilter),
    [bookings, hotelFilter],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return scopedBookings.filter((booking) => {
      if (filter !== "ALL" && booking.status !== filter) return false;
      if (!keyword) return true;
      const meta = metadata[String(booking.id)] ?? {};
      return [
        booking.bookingCode,
        booking.bookerFirstName,
        booking.bookerLastName,
        booking.bookerEmail,
        booking.bookerPhone,
        meta.hotel?.name,
        meta.room?.roomNumber,
        meta.roomType?.name,
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
    });
  }, [filter, metadata, query, scopedBookings]);

  const stats = useMemo(() => ({
    total: scopedBookings.length,
    confirmed: scopedBookings.filter((item) => item.status === "CONFIRMED").length,
    staying: scopedBookings.filter((item) => item.status === "CHECKED_IN").length,
    revenue: scopedBookings
      .filter((item) => !["CANCELLED"].includes(item.status))
      .reduce((sum, item) => sum + Number(item.paidAmount ?? 0), 0),
  }), [scopedBookings]);

  const selectedHotelName = hotelFilter === "ALL"
    ? "Toàn bộ khách sạn"
    : hotelOptions.find((item) => item.id === hotelFilter)?.name ?? "Khách sạn đã chọn";

  if (loading && bookings.length === 0) return <Loading message="Đang tải booking toàn hệ thống..." />;

  return (
    <section className="booking-management-page system-booking-management">
      <header className="booking-management-hero system-booking-hero">
        <div>
          <span className="booking-management-eyebrow">QUẢN TRỊ HỆ THỐNG</span>
          <h1>Đơn đặt phòng toàn hệ thống</h1>
          <p>Theo dõi booking theo từng khách sạn, khách hàng, phòng và trạng thái thanh toán trên dữ liệu thật của EnziuRooms.</p>
        </div>
        <div className="booking-management-hero-actions system-booking-hero-actions">
          <label className="system-booking-hotel-select">
            <Building2 size={17} />
            <select value={hotelFilter} onChange={(event) => setHotelFilter(event.target.value)}>
              <option value="ALL">Tất cả khách sạn</option>
              {hotelOptions.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load()}><RefreshCw size={17} /> Làm mới</button>
        </div>
      </header>

      <ErrorMessage message={error} onRetry={() => void load()} />

      <div className="booking-management-stats system-booking-stats">
        <article><CalendarDays size={20} /><div><small>Booking đang xem</small><strong>{stats.total}</strong><span>{selectedHotelName}</span></div></article>
        <article><Hotel size={20} /><div><small>Đã xác nhận</small><strong>{stats.confirmed}</strong><span>Chờ khách tới lưu trú</span></div></article>
        <article><BedDouble size={20} /><div><small>Đang lưu trú</small><strong>{stats.staying}</strong><span>Booking đã check-in</span></div></article>
        <article><CircleDollarSign size={20} /><div><small>Tiền đã ghi nhận</small><strong>{money(stats.revenue)}</strong><span>Theo phạm vi đang lọc</span></div></article>
      </div>

      <section className="booking-management-panel system-booking-panel">
        <div className="booking-management-toolbar system-booking-toolbar">
          <div className="booking-management-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã booking, khách, khách sạn, số phòng..." /></div>
          <div className="booking-management-filter-list">
            {FILTERS.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
        </div>

        <div className="system-booking-scope-line">
          <div><Hotel size={17} /><span>Đang xem:</span><strong>{selectedHotelName}</strong></div>
          <b>{filtered.length} đơn</b>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<CalendarDays size={30} />} title="Chưa có booking phù hợp" description="Thử đổi khách sạn, trạng thái hoặc từ khóa tìm kiếm." />
        ) : (
          <div className="system-booking-card-list">
            {filtered.map((booking) => {
              const meta = metadata[String(booking.id)] ?? {};
              const progress = paymentProgress(booking);
              const roomImage = roomTypeCover(meta.roomType);
              return (
                <article key={booking.id} className="system-booking-card">
                  <header className="system-booking-card-head">
                    <div className="system-booking-hotel-block">
                      <span className="system-booking-hotel-icon"><Hotel size={19} /></span>
                      <div>
                        <small>Khách sạn</small>
                        <h3>{meta.hotel?.name ?? "Khách sạn"}</h3>
                        <p>{meta.hotel?.city ?? meta.hotel?.address ?? "Chưa cập nhật địa chỉ"}</p>
                      </div>
                    </div>
                    <StatusBadge status={booking.status} size="sm" />
                  </header>

                  <div className="system-booking-card-grid">
                    <div className="system-booking-customer-block">
                      <span className="system-booking-avatar">{customerInitials(booking)}</span>
                      <div><small>Khách đặt phòng</small><strong>{customerName(booking)}</strong><p>{booking.bookingCode}</p></div>
                    </div>

                    <div className="system-booking-room-block">
                      <div className="system-booking-room-media">
                        <span className="system-booking-room-media-placeholder"><BedDouble size={23} /></span>
                        {roomImage ? (
                          <img
                            src={roomImage}
                            alt={meta.roomType?.name ? `Phòng ${meta.roomType.name}` : "Ảnh phòng"}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                          />
                        ) : null}
                        <b>{meta.room?.roomNumber ?? "—"}</b>
                      </div>
                      <div>
                        <small>Phòng</small>
                        <strong>{meta.roomType?.name ?? "Loại phòng"}</strong>
                        <p>{meta.room?.roomNumber ? `Phòng ${meta.room.roomNumber}` : "Chưa có số phòng"}{meta.room?.floor != null ? ` · Tầng ${meta.room.floor}` : ""}</p>
                      </div>
                    </div>

                    <div className="system-booking-stay-block">
                      <CalendarDays size={18} />
                      <div><small>Kỳ lưu trú</small><strong>{date(booking.checkIn)} → {date(booking.checkOut)}</strong><p>{booking.adults ?? 0} người lớn · {booking.children ?? 0} trẻ em</p></div>
                    </div>

                    <div className="system-booking-finance-block">
                      <div className="system-booking-finance-top"><small>Tổng tiền</small><strong>{money(booking.totalPrice)}</strong><span>{paymentLabel(booking.paymentStatus)}</span></div>
                      <div className="system-booking-payment-bar"><i style={{ width: `${progress}%` }} /></div>
                      <div className="system-booking-finance-bottom"><span>Đã trả <b>{money(booking.paidAmount)}</b></span><span>Còn <b>{money(booking.remainingAmount)}</b></span></div>
                    </div>
                  </div>

                  <footer className="system-booking-card-footer">
                    <div><span>Mã booking</span><strong>{booking.bookingCode}</strong></div>
                    <button type="button" onClick={() => setSelected(booking)}><Eye size={16} /> Xem chi tiết</button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (() => {
        const meta = metadata[String(selected.id)] ?? {};
        return (
          <div className="booking-management-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
            <section className="booking-management-modal" role="dialog" aria-modal="true">
              <button className="booking-management-modal-close" onClick={() => setSelected(null)}><X size={20} /></button>
              <span className="booking-management-eyebrow">CHI TIẾT BOOKING HỆ THỐNG</span>
              <h2>{selected.bookingCode}</h2>
              <div className="booking-management-detail-grid">
                <div><UserRound size={18} /><small>Customer</small><strong>{customerName(selected)}</strong><span>{selected.bookerEmail ?? selected.bookerPhone ?? "—"}</span></div>
                <div><Hotel size={18} /><small>Khách sạn</small><strong>{meta.hotel?.name ?? "—"}</strong><span>{meta.hotel?.city ?? meta.hotel?.address ?? "—"}</span></div>
                <div className="booking-management-detail-room">
                  {roomTypeCover(meta.roomType) ? <img src={roomTypeCover(meta.roomType)} alt="Ảnh phòng" /> : <BedDouble size={18} />}
                  <small>Phòng</small>
                  <strong>{meta.roomType?.name ?? "—"}</strong>
                  <span>{meta.room?.roomNumber ? `Phòng ${meta.room.roomNumber}` : "—"}</span>
                </div>
                <div><CalendarDays size={18} /><small>Lưu trú</small><strong>{date(selected.checkIn)} → {date(selected.checkOut)}</strong></div>
                <div><CircleDollarSign size={18} /><small>Tổng / Đã trả</small><strong>{money(selected.totalPrice)}</strong><span>{money(selected.paidAmount)}</span></div>
                <div><CircleDollarSign size={18} /><small>Thanh toán</small><strong>{paymentLabel(selected.paymentStatus)}</strong><span>Còn {money(selected.remainingAmount)}</span></div>
              </div>
            </section>
          </div>
        );
      })() : null}
    </section>
  );
}
