import {
  ArrowDownToLine,
  BedDouble,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  Hotel,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, StatusBadge } from "../../components/ui";
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
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function compactMoney(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0 ₫";
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (absolute >= 1_000_000_000) {
    return `${sign}${(absolute / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  if (absolute >= 1_000) {
    return `${sign}${Math.round(absolute / 1_000).toLocaleString("vi-VN")}k`;
  }
  return `${Math.round(amount).toLocaleString("vi-VN")} ₫`;
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

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
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

function formatChartDay(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(value);
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
            hotelId: item.hotelId ?? item.hotel?.id ?? null,
          });
        }
      } else if (item.type === "REFUND_DEBIT") {
        rows.push({
          amount: Number(item.amount ?? 0),
          createdAt: item.createdAt,
          hotelId: item.hotelId ?? item.hotel?.id ?? null,
        });
      }
    });

  return rows;
}

function selectHotelTransactions(transactions, hotelId) {
  const withHotelIdentity = transactions.filter(
    (item) => item?.hotelId || item?.hotel?.id,
  );
  if (withHotelIdentity.length === 0 || !hotelId) {
    return { rows: transactions, accountLevel: true };
  }
  return {
    rows: transactions.filter(
      (item) => String(item?.hotelId ?? item?.hotel?.id ?? "") === String(hotelId),
    ),
    accountLevel: false,
  };
}

function calculateTrend(current, previous) {
  const currentValue = Number(current ?? 0);
  const previousValue = Number(previous ?? 0);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null;
  if (previousValue === 0) return currentValue > 0 ? { value: 100, up: true } : null;
  const percentage = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  return {
    value: Math.abs(percentage),
    up: percentage >= 0,
  };
}

function buildRevenueSeries(events, today = new Date()) {
  const end = startOfDay(today);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(end, index - 6);
    const key = localDateKey(date);
    const amount = events
      .filter((event) => String(event.createdAt ?? "").slice(0, 10) === key)
      .reduce((total, event) => total + Number(event.amount ?? 0), 0);
    return {
      key,
      date,
      label: formatChartDay(date),
      amount,
    };
  });
}

function RevenueLineChart({ series }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 760;
  const height = 260;
  const padding = { left: 56, right: 18, top: 24, bottom: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.map((item) => Number(item.amount ?? 0));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const spread = Math.max(maximum - minimum, 1);
  const paddedMin = minimum < 0 ? minimum - spread * 0.08 : 0;
  const paddedMax = maximum > 0 ? maximum + spread * 0.12 : 1;
  const range = Math.max(paddedMax - paddedMin, 1);
  const xFor = (index) => padding.left + (series.length <= 1 ? 0 : (index / (series.length - 1)) * chartWidth);
  const yFor = (value) => padding.top + ((paddedMax - value) / range) * chartHeight;
  const points = series.map((item, index) => ({
    ...item,
    x: xFor(index),
    y: yFor(Number(item.amount ?? 0)),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const baselineY = yFor(0);
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : "";
  const gridValues = Array.from({ length: 5 }, (_, index) => paddedMax - (range * index) / 4);
  const hovered = hoveredIndex === null ? null : points[hoveredIndex];

  return (
    <div className="ha-revenue-chart-shell">
      <svg
        className="ha-revenue-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Biểu đồ doanh thu 7 ngày gần nhất"
      >
        <defs>
          <linearGradient id="haRevenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1677ff" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#1677ff" stopOpacity="0.015" />
          </linearGradient>
        </defs>

        {gridValues.map((value, index) => {
          const y = padding.top + (index / 4) * chartHeight;
          return (
            <g key={`${value}-${index}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="ha-revenue-grid-line"
              />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="ha-revenue-axis-label">
                {compactMoney(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baselineY}
          y2={baselineY}
          className="ha-revenue-zero-line"
        />

        {areaPath ? <path d={areaPath} fill="url(#haRevenueArea)" /> : null}
        {linePath ? <path d={linePath} className="ha-revenue-line" /> : null}

        {points.map((point, index) => (
          <g
            key={point.key}
            className="ha-revenue-point-group"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            tabIndex="0"
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
          >
            <circle cx={point.x} cy={point.y} r="11" className="ha-revenue-point-hit" />
            <circle cx={point.x} cy={point.y} r="5" className="ha-revenue-point" />
            <text x={point.x} y={height - 14} textAnchor="middle" className="ha-revenue-day-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      {hovered ? (
        <div
          className="ha-revenue-tooltip"
          style={{
            left: `${(hovered.x / width) * 100}%`,
            top: `${Math.max(8, ((hovered.y - 18) / height) * 100)}%`,
          }}
        >
          <span>{hovered.label}</span>
          <strong>{money(hovered.amount)}</strong>
        </div>
      ) : null}
    </div>
  );
}

function RoomStatusDonut({ available, occupied, cleaning, maintenance, inactive }) {
  const total = available + occupied + cleaning + maintenance + inactive;
  const safeTotal = Math.max(total, 1);
  const availablePercent = (available / safeTotal) * 100;
  const occupiedPercent = (occupied / safeTotal) * 100;
  const cleaningPercent = (cleaning / safeTotal) * 100;
  const maintenancePercent = (maintenance / safeTotal) * 100;
  const inactivePercent = (inactive / safeTotal) * 100;

  const a1 = availablePercent;
  const a2 = a1 + occupiedPercent;
  const a3 = a2 + cleaningPercent;
  const a4 = a3 + maintenancePercent;

  const background = total === 0
    ? "#edf3f4"
    : `conic-gradient(
        #4fc67a 0% ${a1}%,
        #387ff2 ${a1}% ${a2}%,
        #f4a033 ${a2}% ${a3}%,
        #8c62d9 ${a3}% ${a4}%,
        #ef5c5c ${a4}% 100%
      )`;

  const legend = [
    ["ready", "Phòng trống", available, availablePercent],
    ["occupied", "Đang ở", occupied, occupiedPercent],
    ["cleaning", "Đang dọn", cleaning, cleaningPercent],
    ["maintenance", "Bảo trì", maintenance, maintenancePercent],
    ["inactive", "Ngừng hoạt động", inactive, inactivePercent],
  ];

  return (
    <div className="ha-room-chart-body">
      <div className="ha-room-donut" style={{ background }}>
        <div className="ha-room-donut-center">
          <strong>{total}</strong>
          <span>Tổng số phòng</span>
        </div>
      </div>
      <div className="ha-room-legend">
        {legend.map(([tone, label, value, percent]) => (
          <div key={tone}>
            <span><i className={tone} />{label}</span>
            <strong>{value} <small>({Math.round(percent)}%)</small></strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function bookingStatusLabel(status) {
  const normalized = normalizeEnum(status);
  if (normalized === "PENDING") return "Chờ xử lý";
  return STATUS_LABELS[normalized] ?? "Chưa xác định";
}

function DashboardMetric({ icon: Icon, tone, label, value, helper, trend }) {
  return (
    <article className={`ha-dashboard-metric ${tone}`}>
      <span className="ha-dashboard-metric-icon"><Icon size={22} /></span>
      <div className="ha-dashboard-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={trend ? (trend.up ? "positive" : "negative") : "neutral"}>
          {trend ? (
            <>
              {trend.up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {trend.value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% so với hôm qua
            </>
          ) : helper}
        </small>
      </div>
    </article>
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
  const [sourceAvailable, setSourceAvailable] = useState({
    stays: true,
    wallet: true,
    transactions: true,
    refunds: true,
    operations: true,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    const [hotelData, stayResult, walletResult, transactionResult, refundResult] = await Promise.all([
      getMyHotels(),
      getCurrentHotelStays()
        .then((data) => ({ available: true, data }))
        .catch(() => ({ available: false, data: [] })),
      getMyWallet()
        .then((data) => ({ available: true, data }))
        .catch(() => ({ available: false, data: null })),
      getMyWalletTransactions()
        .then((data) => ({ available: true, data }))
        .catch(() => ({ available: false, data: [] })),
      getHotelRefundRequests()
        .then((data) => ({ available: true, data }))
        .catch(() => ({ available: false, data: [] })),
    ]);

    const safeHotels = (Array.isArray(hotelData) ? hotelData : [])
      .filter((hotel) => hotel.approvalStatus === "APPROVED" && hotel.status === "ACTIVE");

    setHotels(safeHotels);
    setStays(Array.isArray(stayResult.data) ? stayResult.data : []);
    setWallet(walletResult.data);
    setWalletTransactions(Array.isArray(transactionResult.data) ? transactionResult.data : []);
    setRefundRequests(Array.isArray(refundResult.data) ? refundResult.data : []);
    setSourceAvailable((current) => ({
      ...current,
      stays: stayResult.available,
      wallet: walletResult.available,
      transactions: transactionResult.available,
      refunds: refundResult.available,
    }));
    return safeHotels;
  }, []);

  const loadHotel = useCallback(async (hotelId) => {
    if (!hotelId) {
      setRoomTypes([]);
      setRooms([]);
      setBookings([]);
      setSourceAvailable((current) => ({ ...current, operations: false }));
      return;
    }

    try {
      const [typeData, roomData, bookingData] = await Promise.all([
        getRoomTypes(hotelId),
        getManagedRooms(hotelId),
        getHotelBookings(hotelId),
      ]);

      setRoomTypes(Array.isArray(typeData) ? typeData : []);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setBookings(Array.isArray(bookingData) ? bookingData : []);
      setSourceAvailable((current) => ({ ...current, operations: true }));
    } catch (requestError) {
      setSourceAvailable((current) => ({ ...current, operations: false }));
      throw requestError;
    }
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

  async function changeHotel(event) {
    const nextHotelId = event.target.value;
    if (!nextHotelId || nextHotelId === selectedHotelId) return;

    setSelectedHotelId(nextHotelId);
    setRefreshing(true);
    setError("");
    try {
      await loadHotel(nextHotelId);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Chưa thể tải thông tin của khách sạn đã chọn.");
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
  const yesterday = useMemo(() => addDays(today, -1), [today]);

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
      inactive: count("INACTIVE"),
    };
  }, [rooms]);

  const todayArrivals = useMemo(
    () => bookings.filter((booking) => sameDay(booking.checkIn, today) && ["CONFIRMED", "CHECKED_IN"].includes(booking.status)),
    [bookings, today],
  );

  const todayBookings = useMemo(
    () => bookings.filter((booking) => sameDay(booking.createdAt, today)),
    [bookings, today],
  );

  const yesterdayBookings = useMemo(
    () => bookings.filter((booking) => sameDay(booking.createdAt, yesterday)),
    [bookings, yesterday],
  );

  const selectedHotelStays = useMemo(
    () => stays.filter((item) => String(item.booking?.hotelId ?? item.hotelId ?? "") === String(selectedHotelId)),
    [stays, selectedHotelId],
  );

  const pendingRefunds = useMemo(
    () => refundRequests.filter((item) => {
      const status = normalizeEnum(item.status);
      if (status === "PENDING_HOTEL_REVIEW") return true;
      return ["APPROVED", "PARTIALLY_COMPLETED"].includes(status)
        && Number(item.hotelDirectAmount ?? 0) > 0
        && !item.hotelRefundCompleted;
    }),
    [refundRequests],
  );

  const occupancyRate = roomStats.total > 0
    ? Math.round((roomStats.occupied / roomStats.total) * 100)
    : 0;

  const selectedTransactionState = useMemo(
    () => selectHotelTransactions(walletTransactions, selectedHotelId),
    [walletTransactions, selectedHotelId],
  );

  const selectedRevenueEvents = useMemo(
    () => revenueEvents(selectedTransactionState.rows),
    [selectedTransactionState.rows],
  );

  const revenue = useMemo(() => {
    const sum = (predicate) => selectedRevenueEvents
      .filter((event) => predicate(event.createdAt))
      .reduce((total, event) => total + Number(event.amount ?? 0), 0);

    return {
      today: sum((value) => sameDay(value, today)),
      yesterday: sum((value) => sameDay(value, yesterday)),
      month: sum((value) => sameMonth(value, today)),
    };
  }, [selectedRevenueEvents, today, yesterday]);

  const revenueSeries = useMemo(
    () => buildRevenueSeries(selectedRevenueEvents, today),
    [selectedRevenueEvents, today],
  );

  const revenueTrend = useMemo(
    () => calculateTrend(revenue.today, revenue.yesterday),
    [revenue.today, revenue.yesterday],
  );

  const bookingTrend = useMemo(
    () => calculateTrend(todayBookings.length, yesterdayBookings.length),
    [todayBookings.length, yesterdayBookings.length],
  );

  const recentBookings = useMemo(
    () => [...bookings]
      .sort((a, b) => new Date(b.createdAt ?? b.checkIn ?? 0) - new Date(a.createdAt ?? a.checkIn ?? 0))
      .slice(0, 5),
    [bookings],
  );

  function bookingRoomLabel(booking) {
    const room = roomMap[String(booking.roomId)] ?? null;
    const type = room ? roomTypeMap[String(room.roomTypeId)] : null;
    const roomNumber = room?.roomNumber ?? booking.roomNumber ?? "—";
    return type?.name ? `${roomNumber} · ${type.name}` : String(roomNumber);
  }

  if (loading) {
    return <Loading message="Đang tải tổng quan khách sạn..." />;
  }

  if (hotels.length === 0) {
    return (
      <main className="hotel-overview-dashboard ha-dashboard-redesign">
        <EmptyState
          className="hotel-overview-empty"
          icon={<Hotel size={34} />}
          title={error ? "Chưa thể hiển thị tổng quan" : "Chưa có khách sạn đang hoạt động"}
          description={error
            ? "Dữ liệu khách sạn chưa tải được. Hãy thử lại khi kết nối ổn định."
            : "Bạn cần có khách sạn đã được duyệt để xem tổng quan vận hành."}
          actions={error ? (
            <button type="button" className="hotel-overview-refresh" onClick={() => void initialLoad()}>
              <RefreshCw size={17} /> Thử lại
            </button>
          ) : (
            <Link to="/hotel-admin/hotels/create">Đăng ký khách sạn</Link>
          )}
        />
      </main>
    );
  }

  const financialRows = [
    {
      label: "Số dư khả dụng",
      value: sourceAvailable.wallet ? Number(wallet?.availableBalance ?? 0) : null,
      tone: "blue",
    },
    {
      label: "Doanh thu đang giữ",
      value: sourceAvailable.wallet ? Number(wallet?.pendingBalance ?? 0) : null,
      tone: "violet",
    },
    {
      label: "Doanh thu tháng này",
      value: sourceAvailable.transactions ? Number(revenue.month ?? 0) : null,
      tone: "green",
    },
    {
      label: "Hoàn tiền cần xử lý",
      value: sourceAvailable.refunds ? pendingRefunds.length : null,
      count: true,
      tone: "orange",
    },
  ];
  const financeScaleMax = Math.max(
    ...financialRows.filter((row) => !row.count && row.value !== null).map((row) => Math.abs(row.value)),
    1,
  );

  return (
    <main className="hotel-overview-dashboard ha-dashboard-redesign">
      <section className="ha-dashboard-hero">
        <div>
          <span className="ha-dashboard-eyebrow">VẬN HÀNH KHÁCH SẠN</span>
          <h1>Xin chào, {selectedHotel?.name || "Đối tác khách sạn"}! <span aria-hidden="true">👋</span></h1>
          <p>Đây là tổng quan hoạt động và doanh thu của khách sạn hôm nay.</p>
        </div>
        <div className="ha-dashboard-hero-actions">
          {hotels.length > 1 ? (
            <label className="ha-dashboard-hotel-picker">
              <span>Khách sạn</span>
              <select value={selectedHotelId} onChange={(event) => void changeHotel(event)} disabled={refreshing}>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="ha-dashboard-date-chip">
            <CalendarDays size={18} />
            <span>{formatTodayLabel(today)}</span>
          </div>
          <button type="button" className="ha-dashboard-refresh" onClick={() => void refreshAll()} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            Làm mới
          </button>
        </div>
      </section>

      <ErrorMessage message={error} onRetry={() => void refreshAll()} />

      <section className="ha-dashboard-metrics" aria-label="Chỉ số tổng quan">
        <DashboardMetric
          icon={CircleDollarSign}
          tone="blue"
          label="Doanh thu hôm nay"
          value={sourceAvailable.transactions ? money(revenue.today) : "—"}
          helper={selectedTransactionState.accountLevel ? "Theo ví tài khoản đối tác" : "Theo khách sạn đang xem"}
          trend={sourceAvailable.transactions ? revenueTrend : null}
        />
        <DashboardMetric
          icon={CalendarCheck2}
          tone="green"
          label="Đơn đặt phòng hôm nay"
          value={sourceAvailable.operations ? todayBookings.length : "—"}
          helper={sourceAvailable.operations ? `${bookings.length} đơn tại khách sạn` : "Chưa thể tải thông tin"}
          trend={sourceAvailable.operations ? bookingTrend : null}
        />
        <DashboardMetric
          icon={BedDouble}
          tone="violet"
          label="Khách nhận phòng"
          value={sourceAvailable.operations ? todayArrivals.length : "—"}
          helper={sourceAvailable.stays ? `${selectedHotelStays.length} khách/phòng đang lưu trú` : "Thông tin lưu trú chưa sẵn sàng"}
        />
        <DashboardMetric
          icon={DoorOpen}
          tone="orange"
          label="Tỷ lệ lấp đầy"
          value={sourceAvailable.operations ? `${occupancyRate}%` : "—"}
          helper={sourceAvailable.operations ? `${roomStats.occupied}/${roomStats.total} phòng đang sử dụng` : "Chưa thể tải thông tin"}
        />
      </section>

      <section className="ha-dashboard-analytics-grid">
        <article className="ha-dashboard-panel ha-dashboard-revenue-panel">
          <header className="ha-dashboard-panel-header">
            <div>
              <div className="ha-dashboard-panel-title-row">
                <h2>Doanh thu</h2>
                <span className="ha-dashboard-info" title="Doanh thu được tổng hợp từ các giao dịch đã ghi nhận.">i</span>
              </div>
              <p>{selectedTransactionState.accountLevel
                ? "Doanh thu thuần 7 ngày gần nhất của tài khoản đối tác"
                : "Doanh thu thuần 7 ngày gần nhất của khách sạn đang xem"}</p>
            </div>
            <div className="ha-dashboard-period">7 ngày qua</div>
          </header>
          {sourceAvailable.transactions ? (
            <>
              <div className="ha-dashboard-chart-legend">
                <span><i />Doanh thu thuần</span>
                <strong>{money(revenueSeries.reduce((sum, item) => sum + item.amount, 0))}</strong>
              </div>
              <RevenueLineChart series={revenueSeries} />
            </>
          ) : (
            <div className="ha-dashboard-inline-empty">Chưa thể tải thông tin doanh thu.</div>
          )}
        </article>

        <article className="ha-dashboard-panel ha-dashboard-room-panel">
          <header className="ha-dashboard-panel-header">
            <div>
              <div className="ha-dashboard-panel-title-row">
                <h2>Tình trạng phòng</h2>
                <span className="ha-dashboard-info" title="Tỷ lệ dựa trên trạng thái phòng hiện tại.">i</span>
              </div>
              <p>Cập nhật theo trạng thái phòng hiện tại</p>
            </div>
            <Link to="/hotel-admin/rooms" className="ha-dashboard-text-link">Xem chi tiết</Link>
          </header>
          {sourceAvailable.operations ? (
            <RoomStatusDonut
              available={roomStats.available}
              occupied={roomStats.occupied}
              cleaning={roomStats.cleaning}
              maintenance={roomStats.maintenance}
              inactive={roomStats.inactive}
            />
          ) : (
            <div className="ha-dashboard-inline-empty">Chưa thể tải thông tin phòng.</div>
          )}
        </article>
      </section>

      <section className="ha-dashboard-bottom-grid">
        <article className="ha-dashboard-panel ha-dashboard-bookings-panel">
          <header className="ha-dashboard-panel-header">
            <div>
              <h2>Đơn đặt phòng mới nhất</h2>
              <p>{sourceAvailable.operations ? `${bookings.length} đơn của ${selectedHotel?.name}` : "Chưa thể tải danh sách đơn đặt phòng"}</p>
            </div>
            <Link to="/hotel-admin/bookings" className="ha-dashboard-text-link">
              Xem tất cả đơn đặt phòng <ChevronRight size={16} />
            </Link>
          </header>
          <div className="ha-dashboard-table-wrap">
            <table className="ha-dashboard-booking-table">
              <thead>
                <tr>
                  <th>Mã đặt phòng</th>
                  <th>Khách hàng</th>
                  <th>Phòng</th>
                  <th>Nhận phòng</th>
                  <th>Trả phòng</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {!sourceAvailable.operations || recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="ha-dashboard-table-empty">
                      {sourceAvailable.operations ? "Chưa có đơn đặt phòng để hiển thị." : "Chưa thể tải danh sách đơn đặt phòng."}
                    </td>
                  </tr>
                ) : recentBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td><span className="ha-dashboard-booking-code">{booking.bookingCode ?? "Chưa có mã"}</span></td>
                    <td><strong>{guestName(booking)}</strong></td>
                    <td>{bookingRoomLabel(booking)}</td>
                    <td>{formatDate(booking.checkIn)}</td>
                    <td>{formatDate(booking.checkOut)}</td>
                    <td><strong>{money(booking.totalPrice)}</strong></td>
                    <td>
                      <StatusBadge
                        status={booking.status}
                        label={bookingStatusLabel(booking.status)}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="ha-dashboard-panel ha-dashboard-finance-panel">
          <header className="ha-dashboard-panel-header">
            <div>
              <div className="ha-dashboard-panel-title-row">
                <h2>Tổng quan tài chính</h2>
                <span className="ha-dashboard-info" title="Số liệu thực tế từ ví đối tác và yêu cầu hoàn tiền.">i</span>
              </div>
              <p>Ví, doanh thu và khoản cần xử lý</p>
            </div>
            <Link to="/hotel-admin/wallet" className="ha-dashboard-period">Ví & rút tiền</Link>
          </header>

          <div className="ha-dashboard-finance-rows">
            {financialRows.map((row) => {
              const width = row.count || row.value === null
                ? 0
                : Math.max(5, Math.min(100, (Math.abs(row.value) / financeScaleMax) * 100));
              return (
                <div className="ha-dashboard-finance-row" key={row.label}>
                  <div className={`ha-dashboard-finance-icon ${row.tone}`}>
                    {row.count ? <ArrowDownToLine size={17} /> : <WalletCards size={17} />}
                  </div>
                  <div className="ha-dashboard-finance-copy">
                    <div>
                      <span>{row.label}</span>
                      <strong>{row.value === null ? "—" : (row.count ? `${row.value} yêu cầu` : money(row.value))}</strong>
                    </div>
                    {!row.count ? (
                      <div className="ha-dashboard-finance-track">
                        <i className={row.tone} style={{ width: `${width}%` }} />
                      </div>
                    ) : (
                      <small>{row.value > 0 ? "Cần xem xét trên trang ví" : "Không có yêu cầu tồn đọng"}</small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Link to="/hotel-admin/wallet" className="ha-dashboard-finance-total">
            <span>Số dư khả dụng</span>
            <strong>{sourceAvailable.wallet ? money(wallet?.availableBalance) : "—"}</strong>
            <ChevronRight size={18} />
          </Link>
        </article>
      </section>
    </main>
  );
}
