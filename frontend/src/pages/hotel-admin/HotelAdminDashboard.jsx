import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BedDouble,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  FileClock,
  Hotel,
  Info,
  QrCode,
  RefreshCw,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  getCurrentHotelStays,
  getHotelBookings,
} from "../../services/bookingService";
import {
  getManagedRooms,
  getMyHotels,
  getRoomTypes,
} from "../../services/hotelAdminService";
import {
  getHotelRefundRequests,
  getMyWallet,
  getMyWalletTransactions,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const BOOKING_STATUS = {
  PENDING: "Chờ xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  NO_SHOW: "Không đến",
  CANCELLED: "Đã hủy",
};

const BOOKING_TONE = {
  PENDING: "pending",
  PENDING_PAYMENT: "pending",
  CONFIRMED: "confirmed",
  CHECKED_IN: "stay",
  CHECKED_OUT: "done",
  NO_SHOW: "no-show",
  CANCELLED: "cancelled",
};

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseLocalDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatTodayLabel(value = new Date()) {
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(value);
  const date = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date}`;
}

function sameDay(value, target = new Date()) {
  if (!value) return false;
  return String(value).slice(0, 10) === localDateKey(target);
}

function sameMonth(value, target = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function guestName(booking) {
  const directName = [
    booking?.guestName,
    booking?.customerName,
    booking?.bookerName,
    booking?.fullName,
    booking?.customerFullName,
  ].find((value) => typeof value === "string" && value.trim());

  if (directName) return directName.trim();

  const guestFullName = [booking?.guestLastName, booking?.guestFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (guestFullName) return guestFullName;

  const bookerFullName = [booking?.bookerLastName, booking?.bookerFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (bookerFullName) return bookerFullName;

  return booking?.guestEmail || booking?.bookerEmail || "Chưa có tên khách";
}

function revenueEvents(transactions) {
  const seenRevenuePayments = new Set();
  const rows = [];

  [...transactions]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((item) => {
      if (
        item.type === "HOTEL_REVENUE_PENDING"
        || item.type === "HOTEL_REVENUE_RELEASED"
        || item.type === "CASH_REVENUE_RECORDED"
      ) {
        const key = item.paymentId || item.id;
        if (!seenRevenuePayments.has(key)) {
          seenRevenuePayments.add(key);
          rows.push({
            amount: Math.max(0, Number(item.amount ?? 0)),
            createdAt: item.createdAt,
          });
        }
      } else if (item.type === "REFUND_DEBIT") {
        rows.push({
          amount: Number(item.amount ?? 0),
          createdAt: item.createdAt,
        });
      }
    });

  return rows;
}

function activeBookingOnDate(booking, date) {
  if (!["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(booking?.status)) return false;
  const checkIn = parseLocalDate(booking?.checkIn);
  const checkOut = parseLocalDate(booking?.checkOut);
  if (!checkIn || !checkOut) return false;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return checkIn <= target && target < checkOut;
}

function buildOccupancyTrend(bookings, rooms, days = 7) {
  const today = new Date();
  const totalRooms = Math.max(rooms.length, 1);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    date.setDate(date.getDate() - (days - 1 - index));

    const occupiedRoomIds = new Set(
      bookings
        .filter((booking) => activeBookingOnDate(booking, date))
        .map((booking) => booking.roomId)
        .filter(Boolean)
        .map(String),
    );

    const occupied = occupiedRoomIds.size;
    return {
      key: localDateKey(date),
      label: formatShortDate(date),
      value: rooms.length > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
    };
  });
}

function OccupancyLineChart({ data }) {
  const width = 560;
  const height = 190;
  const paddingX = 20;
  const paddingTop = 12;
  const paddingBottom = 34;
  const plotHeight = height - paddingTop - paddingBottom;
  const step = data.length > 1 ? (width - paddingX * 2) / (data.length - 1) : 0;

  const points = data.map((item, index) => {
    const x = paddingX + step * index;
    const y = paddingTop + plotHeight - (Math.min(100, Math.max(0, item.value)) / 100) * plotHeight;
    return { ...item, x, y };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `M ${points[0].x} ${height - paddingBottom} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${height - paddingBottom} Z`
    : "";

  return (
    <div className="hotel-overview-line-chart">
      <div className="hotel-overview-chart-y-labels" aria-hidden="true">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ tỷ lệ lấp đầy 7 ngày">
        <defs>
          <linearGradient id="occupancyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14a89a" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#14a89a" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((value) => {
          const y = paddingTop + plotHeight - (value / 100) * plotHeight;
          return <line key={value} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="grid-line" />;
        })}
        {area ? <path d={area} fill="url(#occupancyFill)" /> : null}
        {points.length > 1 ? <polyline points={line} fill="none" className="trend-line" /> : null}
        {points.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r="4" className="trend-point" />
        ))}
        {points.map((point) => (
          <text key={`label-${point.key}`} x={point.x} y={height - 9} textAnchor="middle" className="axis-label">
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function RoomStatusDonut({ available, occupied, cleaning, maintenance }) {
  const total = available + occupied + cleaning + maintenance;
  const safeTotal = Math.max(total, 1);
  const availablePercent = (available / safeTotal) * 100;
  const cleaningPercent = (cleaning / safeTotal) * 100;
  const maintenancePercent = (maintenance / safeTotal) * 100;
  const occupiedPercent = (occupied / safeTotal) * 100;

  const a1 = availablePercent;
  const a2 = a1 + cleaningPercent;
  const a3 = a2 + maintenancePercent;

  const background = total === 0
    ? "#edf3f4"
    : `conic-gradient(
        #58bf7a 0% ${a1}%,
        #5b9cec ${a1}% ${a2}%,
        #f5a735 ${a2}% ${a3}%,
        #e85e58 ${a3}% 100%
      )`;

  return (
    <div className="hotel-overview-room-state-body">
      <div className="hotel-overview-donut" style={{ background }}>
        <div className="hotel-overview-donut-center">
          <strong>{total}</strong>
          <span>Tổng số phòng</span>
        </div>
      </div>
      <div className="hotel-overview-room-legend">
        <div><span><i className="ready" />Sẵn sàng</span><strong>{available} ({Math.round(availablePercent)}%)</strong></div>
        <div><span><i className="cleaning" />Đang dọn</span><strong>{cleaning} ({Math.round(cleaningPercent)}%)</strong></div>
        <div><span><i className="maintenance" />Bảo trì</span><strong>{maintenance} ({Math.round(maintenancePercent)}%)</strong></div>
        <div><span><i className="occupied" />Đang sử dụng</span><strong>{occupied} ({Math.round(occupiedPercent)}%)</strong></div>
      </div>
    </div>
  );
}

function EventRow({ icon: Icon, tone, title, value, helper, detail }) {
  return (
    <div className="hotel-overview-today-row">
      <div className={`hotel-overview-today-icon ${tone}`}><Icon size={21} /></div>
      <div className="hotel-overview-today-copy">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
        {!detail ? <span>{helper}</span> : null}
      </div>
      <b>{value}</b>
    </div>
  );
}

export default function HotelAdminDashboard() {
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stays, setStays] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    const [hotelData, stayData, walletData, transactionData, refundData] = await Promise.all([
      getMyHotels(),
      getCurrentHotelStays().catch(() => []),
      getMyWallet().catch(() => null),
      getMyWalletTransactions().catch(() => []),
      getHotelRefundRequests().catch(() => []),
    ]);

    const safeHotels = (Array.isArray(hotelData) ? hotelData : [])
      .filter((hotel) => hotel.approvalStatus === "APPROVED" && hotel.status === "ACTIVE");

    setHotels(safeHotels);
    setStays(Array.isArray(stayData) ? stayData : []);
    setWallet(walletData);
    setWalletTransactions(Array.isArray(transactionData) ? transactionData : []);
    setRefundRequests(Array.isArray(refundData) ? refundData : []);
    return safeHotels;
  }, []);

  const loadHotel = useCallback(async (hotelId) => {
    if (!hotelId) {
      setRoomTypes([]);
      setRooms([]);
      setBookings([]);
      return;
    }

    const [typeData, roomData, bookingData] = await Promise.all([
      getRoomTypes(hotelId),
      getManagedRooms(hotelId),
      getHotelBookings(hotelId),
    ]);

    setRoomTypes(Array.isArray(typeData) ? typeData : []);
    setRooms(Array.isArray(roomData) ? roomData : []);
    setBookings(Array.isArray(bookingData) ? bookingData : []);
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const safeHotels = await loadBase();
      const firstHotelId = safeHotels[0]?.id ?? "";
      setSelectedHotelId(firstHotelId);
      await loadHotel(firstHotelId);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải tổng quan khách sạn.");
    } finally {
      setLoading(false);
    }
  }, [loadBase, loadHotel]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  async function refreshAll() {
    setRefreshing(true);
    setError("");
    try {
      await Promise.all([loadBase(), loadHotel(selectedHotelId)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể làm mới Dashboard.");
    } finally {
      setRefreshing(false);
    }
  }

  useRealtimeRefresh(
    ["NOTIFICATION_CREATED", "AVAILABILITY_CHANGED"],
    () => void refreshAll(),
    { debounceMs: 220 },
  );

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === selectedHotelId) ?? null,
    [hotels, selectedHotelId],
  );

  const today = useMemo(() => new Date(), []);
  const todayKey = localDateKey(today);

  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [String(type.id), type])),
    [roomTypes],
  );

  const roomMap = useMemo(
    () => Object.fromEntries(rooms.map((room) => [String(room.id), room])),
    [rooms],
  );

  const roomStats = useMemo(() => {
    const count = (status) => rooms.filter((room) => room.status === status).length;
    return {
      total: rooms.length,
      available: count("AVAILABLE"),
      occupied: count("OCCUPIED"),
      cleaning: count("CLEANING"),
      maintenance: count("MAINTENANCE"),
    };
  }, [rooms]);

  const todayArrivals = useMemo(
    () => bookings.filter((booking) => sameDay(booking.checkIn, today) && ["CONFIRMED", "CHECKED_IN"].includes(booking.status)),
    [bookings, today],
  );

  const todayDepartures = useMemo(
    () => bookings.filter((booking) => sameDay(booking.checkOut, today) && ["CHECKED_IN", "CHECKED_OUT"].includes(booking.status)),
    [bookings, today],
  );

  const selectedHotelStays = useMemo(
    () => stays.filter((item) => String(item.booking?.hotelId ?? item.hotelId ?? "") === String(selectedHotelId)),
    [stays, selectedHotelId],
  );

  const pendingRefunds = useMemo(
    () => refundRequests.filter((item) => String(item.status ?? "").toUpperCase() === "PENDING"),
    [refundRequests],
  );

  const occupancyRate = roomStats.total > 0
    ? Math.round((roomStats.occupied / roomStats.total) * 100)
    : 0;

  const occupancyTrend = useMemo(
    () => buildOccupancyTrend(bookings, rooms, 7),
    [bookings, rooms],
  );

  const revenue = useMemo(() => {
    const events = revenueEvents(walletTransactions);
    const sum = (predicate) => events
      .filter((event) => predicate(event.createdAt))
      .reduce((total, event) => total + Number(event.amount ?? 0), 0);

    return {
      today: sum((value) => sameDay(value, today)),
      month: sum((value) => sameMonth(value, today)),
    };
  }, [walletTransactions, today]);

  const recentBookings = useMemo(
    () => [...bookings]
      .sort((a, b) => new Date(b.createdAt ?? b.checkIn ?? 0) - new Date(a.createdAt ?? a.checkIn ?? 0))
      .slice(0, 6),
    [bookings],
  );

  function bookingRoomLabel(booking) {
    const room = roomMap[String(booking.roomId)] ?? null;
    const type = room ? roomTypeMap[String(room.roomTypeId)] : null;
    const roomNumber = room?.roomNumber ?? booking.roomNumber ?? "—";
    return type?.name ? `${roomNumber} · ${type.name}` : String(roomNumber);
  }

  function firstArrivalDetail() {
    const booking = todayArrivals[0];
    if (!booking) return null;
    return `${guestName(booking)} · Phòng ${bookingRoomLabel(booking)}`;
  }

  function firstDepartureDetail() {
    const booking = todayDepartures[0];
    if (!booking) return null;
    return `${guestName(booking)} · Phòng ${bookingRoomLabel(booking)}`;
  }

  if (loading) {
    return <Loading message="Đang tải tổng quan khách sạn..." />;
  }

  if (hotels.length === 0) {
    return (
      <main className="hotel-overview-dashboard">
        <section className="hotel-overview-empty">
          <Hotel size={44} />
          <h1>Chưa có khách sạn đang hoạt động</h1>
          <p>Bạn cần có khách sạn đã được duyệt để xem Dashboard.</p>
          <Link to="/hotel-admin/hotels/create">Đăng ký khách sạn</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="hotel-overview-dashboard">
      <section className="hotel-overview-heading">
        <div>
          <h1>Tổng quan</h1>
          <p>
            Xin chào, Hotel Manager! Đây là tình hình hoạt động của {selectedHotel?.name ?? "khách sạn"} hôm nay.
          </p>
        </div>

        <div className="hotel-overview-heading-actions">
          <div className="hotel-overview-date-chip">
            <CalendarDays size={18} />
            <span>{formatTodayLabel(today)}</span>
          </div>
          <button type="button" className="hotel-overview-refresh" onClick={() => void refreshAll()} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            Làm mới
          </button>
        </div>
      </section>

      <ErrorMessage message={error} />

      <section className="hotel-overview-kpi-grid">
        <article className="hotel-overview-kpi-card teal">
          <div className="hotel-overview-kpi-icon"><ArrowDownToLine size={25} /></div>
          <div>
            <span>Khách đến hôm nay</span>
            <strong>{todayArrivals.length}</strong>
            <small>{todayArrivals.length > 0 ? `${todayArrivals.length} booking cần nhận phòng` : "Chưa có khách đến hôm nay"}</small>
          </div>
        </article>

        <article className="hotel-overview-kpi-card blue">
          <div className="hotel-overview-kpi-icon"><ArrowUpFromLine size={25} /></div>
          <div>
            <span>Khách trả phòng hôm nay</span>
            <strong>{todayDepartures.length}</strong>
            <small>{todayDepartures.length > 0 ? `${todayDepartures.length} booking cần trả phòng` : "Chưa có khách trả hôm nay"}</small>
          </div>
        </article>

        <article className="hotel-overview-kpi-card green">
          <div className="hotel-overview-kpi-icon"><BedDouble size={25} /></div>
          <div>
            <span>Khách đang lưu trú</span>
            <strong>{selectedHotelStays.length}</strong>
            <small>{selectedHotelStays.length > 0 ? `${selectedHotelStays.length} khách/phòng đang ở` : "Hiện chưa có khách lưu trú"}</small>
          </div>
        </article>

        <Link to="/hotel-admin/wallet" className="hotel-overview-kpi-card orange link-card">
          <div className="hotel-overview-kpi-icon"><FileClock size={25} /></div>
          <div>
            <span>Yêu cầu hoàn tiền</span>
            <strong>{pendingRefunds.length}</strong>
            <small>{pendingRefunds.length > 0 ? "Chờ duyệt" : "Không có yêu cầu chờ duyệt"}</small>
          </div>
        </Link>
      </section>

      <section className="hotel-overview-main-grid">
        <article className="hotel-overview-card hotel-overview-occupancy-card">
          <header className="hotel-overview-card-head">
            <div>
              <div className="hotel-overview-title-with-info">
                <h2>Tỷ lệ lấp đầy</h2>
                <Info size={15} />
              </div>
              <strong className="hotel-overview-big-percent">{occupancyRate}%</strong>
              <span>{roomStats.occupied} / {roomStats.total} phòng đang sử dụng</span>
            </div>
            <div className="hotel-overview-filter-chip">7 ngày qua</div>
          </header>
          <OccupancyLineChart data={occupancyTrend} />
        </article>

        <article className="hotel-overview-card hotel-overview-room-state-card">
          <header className="hotel-overview-card-head">
            <div className="hotel-overview-title-with-info">
              <h2>Trạng thái phòng</h2>
              <Info size={15} />
            </div>
          </header>
          <RoomStatusDonut
            available={roomStats.available}
            occupied={roomStats.occupied}
            cleaning={roomStats.cleaning}
            maintenance={roomStats.maintenance}
          />
          <Link to="/hotel-admin/rooms" className="hotel-overview-outline-link">
            <DoorOpen size={17} />
            Xem chi tiết phòng
            <ChevronRight size={17} />
          </Link>
        </article>

        <article className="hotel-overview-card hotel-overview-today-card">
          <header className="hotel-overview-card-head">
            <h2>Việc hôm nay</h2>
          </header>
          <div className="hotel-overview-today-list">
            <EventRow
              icon={ArrowDownToLine}
              tone="teal"
              title="Nhận phòng hôm nay"
              value={todayArrivals.length}
              helper="Không có nhận phòng"
              detail={firstArrivalDetail()}
            />
            <EventRow
              icon={ArrowUpFromLine}
              tone="blue"
              title="Trả phòng hôm nay"
              value={todayDepartures.length}
              helper="Không có trả phòng"
              detail={firstDepartureDetail()}
            />
            <EventRow
              icon={Sparkles}
              tone="orange"
              title="Phòng cần dọn"
              value={roomStats.cleaning}
              helper="Không có phòng cần dọn"
              detail={roomStats.cleaning > 0 ? `${roomStats.cleaning} phòng đang ở trạng thái chờ dọn` : null}
            />
          </div>
        </article>
      </section>

      <section className="hotel-overview-bottom-grid">
        <article className="hotel-overview-card hotel-overview-bookings-card">
          <header className="hotel-overview-card-head bookings-head">
            <div>
              <h2>Đơn gần đây</h2>
              <span>{bookings.length} booking</span>
            </div>
            <span className="hotel-overview-muted-link">Dữ liệu booking thật</span>
          </header>

          <div className="hotel-overview-table-wrap">
            <table className="hotel-overview-booking-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Mã booking</th>
                  <th>Phòng</th>
                  <th>Ngày</th>
                  <th>Ngày đi</th>
                  <th>Trạng thái</th>
                  <th>Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="hotel-overview-table-empty">Chưa có booking để hiển thị.</td>
                  </tr>
                ) : (
                  recentBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td><strong>{guestName(booking)}</strong></td>
                      <td><span className="booking-code">{booking.bookingCode ?? booking.id}</span></td>
                      <td>{bookingRoomLabel(booking)}</td>
                      <td>{formatDate(booking.checkIn)}</td>
                      <td>{formatDate(booking.checkOut)}</td>
                      <td>
                        <span className={`hotel-overview-booking-status ${BOOKING_TONE[booking.status] ?? ""}`}>
                          {BOOKING_STATUS[booking.status] ?? booking.status}
                        </span>
                      </td>
                      <td><strong>{money(booking.totalPrice)}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="hotel-overview-side-stack">
          <article className="hotel-overview-card hotel-overview-finance-card">
            <header className="hotel-overview-card-head">
              <h2>Tổng quan tài chính</h2>
            </header>
            <div className="hotel-overview-finance-list">
              <div>
                <span className="finance-icon teal"><CircleDollarSign size={18} /></span>
                <div><small>Doanh thu hôm nay</small><strong>{money(revenue.today)}</strong></div>
              </div>
              <div>
                <span className="finance-icon blue"><CircleDollarSign size={18} /></span>
                <div><small>Doanh thu tháng này</small><strong>{money(revenue.month)}</strong></div>
              </div>
              <div>
                <span className="finance-icon orange"><WalletCards size={18} /></span>
                <div><small>Số dư khả dụng</small><strong>{money(wallet?.availableBalance)}</strong></div>
              </div>
            </div>
          </article>

          <section className="hotel-overview-mini-grid">
            <article className="hotel-overview-mini-card">
              <span className="purple"><DoorOpen size={19} /></span>
              <div><small>Số phòng hiện tại</small><strong>{roomStats.total} phòng</strong></div>
            </article>
            <article className="hotel-overview-mini-card">
              <span className="green"><Hotel size={19} /></span>
              <div><small>Loại phòng</small><strong>{roomTypes.length} loại</strong></div>
            </article>
          </section>
        </aside>
      </section>

      <section className="hotel-overview-quick-grid">
        <Link to="/hotel-admin/check-in" className="hotel-overview-quick-card">
          <span className="teal"><QrCode size={23} /></span>
          <div><strong>Nhận phòng QR</strong><small>Quét mã và check-in khách nhanh chóng</small></div>
          <ChevronRight size={20} />
        </Link>

        <Link to="/hotel-admin/current-stays" className="hotel-overview-quick-card">
          <span className="blue"><Users size={23} /></span>
          <div><strong>Khách đang lưu trú</strong><small>Xem danh sách khách hiện đang lưu trú</small></div>
          <ChevronRight size={20} />
        </Link>

        <Link to="/hotel-admin/wallet" className="hotel-overview-quick-card">
          <span className="teal"><WalletCards size={23} /></span>
          <div><strong>Ví & rút tiền</strong><small>Quản lý số dư và rút tiền về tài khoản</small></div>
          <ChevronRight size={20} />
        </Link>
      </section>

      <span className="hotel-overview-hidden-date" aria-hidden="true">{todayKey}</span>
    </main>
  );
}
