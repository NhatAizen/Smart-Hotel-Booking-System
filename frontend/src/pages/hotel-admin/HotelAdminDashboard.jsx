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
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "../../components/ui";
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
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} ₫` : "—";
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

function RoomStatusDonut({ available, occupied, cleaning, maintenance, inactive }) {
  const total = available + occupied + cleaning + maintenance + inactive;
  const safeTotal = Math.max(total, 1);
  const availablePercent = (available / safeTotal) * 100;
  const cleaningPercent = (cleaning / safeTotal) * 100;
  const maintenancePercent = (maintenance / safeTotal) * 100;
  const occupiedPercent = (occupied / safeTotal) * 100;
  const inactivePercent = (inactive / safeTotal) * 100;

  const a1 = availablePercent;
  const a2 = a1 + cleaningPercent;
  const a3 = a2 + maintenancePercent;
  const a4 = a3 + occupiedPercent;

  const background = total === 0
    ? "#edf3f4"
    : `conic-gradient(
        #58bf7a 0% ${a1}%,
        #5b9cec ${a1}% ${a2}%,
        #f5a735 ${a2}% ${a3}%,
        #e85e58 ${a3}% ${a4}%,
        #a0a9b3 ${a4}% 100%
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
        <div><span><i className="ready" />Phòng trống</span><strong>{available} ({Math.round(availablePercent)}%)</strong></div>
        <div><span><i className="cleaning" />Cần dọn / đang dọn</span><strong>{cleaning} ({Math.round(cleaningPercent)}%)</strong></div>
        <div><span><i className="maintenance" />Bảo trì</span><strong>{maintenance} ({Math.round(maintenancePercent)}%)</strong></div>
        <div><span><i className="occupied" />Đang sử dụng</span><strong>{occupied} ({Math.round(occupiedPercent)}%)</strong></div>
        <div><span><i className="inactive" />Ngừng hoạt động</span><strong>{inactive} ({Math.round(inactivePercent)}%)</strong></div>
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

function bookingStatusLabel(status) {
  const normalized = normalizeEnum(status);
  if (normalized === "PENDING") return "Chờ xử lý";
  return STATUS_LABELS[normalized] ?? "Chưa xác định";
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
      setError(requestError.response?.data?.message ?? "Không thể tải dữ liệu khách sạn đã chọn.");
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

  const todayDepartures = useMemo(
    () => bookings.filter((booking) => sameDay(booking.checkOut, today) && ["CHECKED_IN", "CHECKED_OUT"].includes(booking.status)),
    [bookings, today],
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

  function roomStatusDetail(status) {
    const matchingRooms = rooms.filter((room) => room.status === status);
    if (matchingRooms.length === 0) return null;
    const visibleNumbers = matchingRooms
      .map((room) => room.roomNumber)
      .filter(Boolean)
      .slice(0, 4);
    if (visibleNumbers.length === 0) return `${matchingRooms.length} phòng cần xử lý`;
    const remainingCount = matchingRooms.length - visibleNumbers.length;
    return `Phòng ${visibleNumbers.join(", ")}${remainingCount > 0 ? ` và ${remainingCount} phòng khác` : ""}`;
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

  return (
    <main className="hotel-overview-dashboard">
      <PageHeader
        className="hotel-overview-heading"
        eyebrow="Vận hành khách sạn"
        title="Tổng quan hôm nay"
        description={`Tình hình cần theo dõi tại ${selectedHotel?.name || "khách sạn đã chọn"}.`}
        icon={<Hotel size={22} />}
        actions={(
          <div className="hotel-overview-heading-actions">
          {hotels.length > 1 ? (
            <label className="hotel-overview-hotel-select">
              <span>Khách sạn</span>
              <select value={selectedHotelId} onChange={(event) => void changeHotel(event)} disabled={refreshing}>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="hotel-overview-date-chip">
            <CalendarDays size={18} />
            <span>{formatTodayLabel(today)}</span>
          </div>
          <button type="button" className="hotel-overview-refresh" onClick={() => void refreshAll()} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            Làm mới
          </button>
          </div>
        )}
      />

      <ErrorMessage message={error} onRetry={() => void refreshAll()} />

      <section className="hotel-overview-kpi-grid" aria-label="Chỉ số vận hành cốt lõi">
        <StatCard
          label="Khách đến hôm nay"
          value={sourceAvailable.operations ? todayArrivals.length : "—"}
          icon={<ArrowDownToLine size={22} />}
          hint={sourceAvailable.operations
            ? (todayArrivals.length ? `${todayArrivals.length} đơn cần nhận phòng` : "Không có khách đến")
            : "Chưa thể tải dữ liệu"}
          tone="success"
        />
        <StatCard
          label="Khách trả hôm nay"
          value={sourceAvailable.operations ? todayDepartures.length : "—"}
          icon={<ArrowUpFromLine size={22} />}
          hint={sourceAvailable.operations
            ? (todayDepartures.length ? `${todayDepartures.length} đơn cần trả phòng` : "Không có khách trả")
            : "Chưa thể tải dữ liệu"}
          tone="info"
        />
        <StatCard
          label="Khách đang lưu trú"
          value={sourceAvailable.stays ? selectedHotelStays.length : "—"}
          icon={<BedDouble size={22} />}
          hint={sourceAvailable.stays
            ? (selectedHotelStays.length ? "Khách/phòng đang ở" : "Hiện chưa có khách lưu trú")
            : "Chưa thể tải dữ liệu"}
          tone="violet"
        />
        <StatCard
          label="Phòng trống"
          value={sourceAvailable.operations ? roomStats.available : "—"}
          icon={<DoorOpen size={22} />}
          hint={sourceAvailable.operations
            ? `${roomStats.total} phòng trong hệ thống`
            : "Chưa thể tải dữ liệu"}
          tone="warning"
        />
      </section>

      <section className="hotel-overview-operations-grid">
        <Panel
          className="hotel-overview-operation-panel"
          title="Việc cần làm"
          description="Ưu tiên theo tình hình vận hành hiện tại"
          icon={<CalendarDays size={20} />}
          actions={<Link to="/hotel-admin/check-in" className="hotel-overview-muted-link">Mở quầy nhận phòng</Link>}
        >
          <div className="hotel-overview-today-list">
            <EventRow
              icon={ArrowDownToLine}
              tone="teal"
              title="Nhận phòng hôm nay"
              value={sourceAvailable.operations ? todayArrivals.length : "—"}
              helper={sourceAvailable.operations ? "Không có nhận phòng" : "Chưa thể tải dữ liệu"}
              detail={sourceAvailable.operations ? firstArrivalDetail() : null}
            />
            <EventRow
              icon={ArrowUpFromLine}
              tone="blue"
              title="Trả phòng hôm nay"
              value={sourceAvailable.operations ? todayDepartures.length : "—"}
              helper={sourceAvailable.operations ? "Không có trả phòng" : "Chưa thể tải dữ liệu"}
              detail={sourceAvailable.operations ? firstDepartureDetail() : null}
            />
            <EventRow
              icon={Sparkles}
              tone="orange"
              title="Phòng cần dọn"
              value={sourceAvailable.operations ? roomStats.cleaning : "—"}
              helper={sourceAvailable.operations ? "Không có phòng cần dọn" : "Chưa thể tải dữ liệu"}
              detail={sourceAvailable.operations ? roomStatusDetail("CLEANING") : null}
            />
            <EventRow
              icon={DoorOpen}
              tone="orange"
              title="Phòng bảo trì"
              value={sourceAvailable.operations ? roomStats.maintenance : "—"}
              helper={sourceAvailable.operations ? "Không có phòng bảo trì" : "Chưa thể tải dữ liệu"}
              detail={sourceAvailable.operations ? roomStatusDetail("MAINTENANCE") : null}
            />
            <EventRow
              icon={FileClock}
              tone="blue"
              title="Hoàn tiền cần xử lý · Toàn tài khoản"
              value={sourceAvailable.refunds ? pendingRefunds.length : "—"}
              helper={sourceAvailable.refunds ? "Không có yêu cầu chờ xử lý" : "Chưa thể tải dữ liệu"}
              detail={sourceAvailable.refunds && pendingRefunds.length > 0
                ? `${pendingRefunds.length} yêu cầu cần xem xét`
                : null}
            />
          </div>
        </Panel>

        <Panel
          className="hotel-overview-operation-panel hotel-overview-room-panel"
          title="Trạng thái phòng"
          description={sourceAvailable.operations
            ? `${roomStats.occupied} / ${roomStats.total} phòng đang sử dụng`
            : "Chưa thể tải dữ liệu phòng"}
          icon={<DoorOpen size={20} />}
          actions={sourceAvailable.operations ? (
            <StatusBadge
              status="OCCUPIED"
              label={`${occupancyRate}% lấp đầy`}
              tone="info"
              size="sm"
            />
          ) : null}
        >
          {sourceAvailable.operations ? (
            <>
              <RoomStatusDonut
                available={roomStats.available}
                occupied={roomStats.occupied}
                cleaning={roomStats.cleaning}
                maintenance={roomStats.maintenance}
                inactive={roomStats.inactive}
              />
              <Link to="/hotel-admin/rooms" className="hotel-overview-outline-link">
                <DoorOpen size={17} />
                Xem chi tiết phòng
                <ChevronRight size={17} />
              </Link>
            </>
          ) : (
            <EmptyState
              icon={<DoorOpen size={28} />}
              title="Chưa thể hiển thị trạng thái phòng"
              description="Hãy thử làm mới khi kết nối ổn định."
              compact
            />
          )}
        </Panel>
      </section>

      <section className="hotel-overview-bottom-grid">
        <Panel
          className="hotel-overview-bookings-panel"
          title="Đơn đặt phòng gần đây"
          description={sourceAvailable.operations
            ? `${bookings.length} đơn của khách sạn đang xem`
            : "Chưa thể tải dữ liệu đơn đặt phòng"}
          icon={<BedDouble size={20} />}
          actions={<Link to="/hotel-admin/check-in" className="hotel-overview-muted-link">Mở quầy nhận phòng</Link>}
          padding="none"
        >
          <div className="hotel-overview-table-wrap">
            <table className="hotel-overview-booking-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Mã đặt phòng</th>
                  <th>Phòng</th>
                  <th>Nhận phòng</th>
                  <th>Trả phòng</th>
                  <th>Trạng thái</th>
                  <th>Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {!sourceAvailable.operations || recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="hotel-overview-table-empty">
                      {sourceAvailable.operations
                        ? "Chưa có đơn đặt phòng để hiển thị."
                        : "Chưa thể tải dữ liệu đơn đặt phòng."}
                    </td>
                  </tr>
                ) : (
                  recentBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td data-label="Khách hàng"><strong>{guestName(booking)}</strong></td>
                      <td data-label="Mã đặt phòng"><span className="booking-code">{booking.bookingCode ?? "Chưa có mã"}</span></td>
                      <td data-label="Phòng">{bookingRoomLabel(booking)}</td>
                      <td data-label="Nhận phòng">{formatDate(booking.checkIn)}</td>
                      <td data-label="Trả phòng">{formatDate(booking.checkOut)}</td>
                      <td data-label="Trạng thái">
                        <StatusBadge
                          className="hotel-overview-booking-status"
                          status={booking.status}
                          label={bookingStatusLabel(booking.status)}
                          size="sm"
                        />
                      </td>
                      <td data-label="Tổng tiền"><strong>{money(booking.totalPrice)}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="hotel-overview-side-stack">
          <Panel
            className="hotel-overview-finance-panel"
            title="Tài chính tài khoản đối tác"
            description="Tổng hợp toàn bộ khách sạn thuộc tài khoản"
            icon={<WalletCards size={20} />}
          >
            <div className="hotel-overview-finance-list">
              <div>
                <span className="finance-icon teal"><CircleDollarSign size={18} /></span>
                <div><small>Doanh thu hôm nay</small><strong>{sourceAvailable.transactions ? money(revenue.today) : "—"}</strong></div>
              </div>
              <div>
                <span className="finance-icon blue"><CircleDollarSign size={18} /></span>
                <div><small>Doanh thu tháng này</small><strong>{sourceAvailable.transactions ? money(revenue.month) : "—"}</strong></div>
              </div>
              <div>
                <span className="finance-icon orange"><WalletCards size={18} /></span>
                <div><small>Số dư khả dụng</small><strong>{sourceAvailable.wallet ? money(wallet?.availableBalance) : "—"}</strong></div>
              </div>
            </div>
          </Panel>
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

    </main>
  );
}
