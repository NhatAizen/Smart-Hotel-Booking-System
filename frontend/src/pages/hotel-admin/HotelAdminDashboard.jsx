import {
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  Hotel,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

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
  getMyWallet,
  getMyWalletTransactions,
} from "../../services/paymentService";
import { scrollToHashTarget } from "../../utils/notificationNavigation";

const BOOKING_STATUS = {
  PENDING: "Chờ xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  CANCELLED: "Đã hủy",
};

const BOOKING_TONE = {
  PENDING: "pending",
  PENDING_PAYMENT: "pending",
  CONFIRMED: "confirmed",
  CHECKED_IN: "stay",
  CHECKED_OUT: "done",
  CANCELLED: "cancelled",
};

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(value, target = new Date()) {
  if (!value) return false;
  return dateKey(value) === dateKey(target);
}

function sameMonth(value, target = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function sameYear(value, target = new Date()) {
  if (!value) return false;
  return new Date(value).getFullYear() === target.getFullYear();
}

function guestName(booking) {
  return (
    [booking?.guestLastName, booking?.guestFirstName].filter(Boolean).join(" ")
    || [booking?.bookerLastName, booking?.bookerFirstName].filter(Boolean).join(" ")
    || "Khách EnziuRooms"
  );
}

function revenueEvents(transactions) {
  const seenRevenuePayments = new Set();
  const rows = [];

  [...transactions]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((item) => {
      if (item.type === "HOTEL_REVENUE_PENDING"
          || item.type === "HOTEL_REVENUE_RELEASED"
          || item.type === "CASH_REVENUE_RECORDED") {
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

function lastDaysRevenue(events, days = 7) {
  const today = startOfDay();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = dateKey(date);
    const amount = events
      .filter((event) => dateKey(event.createdAt) === key)
      .reduce((sum, event) => sum + Number(event.amount ?? 0), 0);

    return {
      key,
      amount,
      label: new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }).format(date),
    };
  });
}

function MiniRevenueChart({ data }) {
  const max = Math.max(...data.map((item) => item.amount), 1);

  return (
    <div className="hotel-dashboard-chart">
      <div className="hotel-dashboard-chart-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="hotel-dashboard-bars">
        {data.map((item) => {
          const height = item.amount <= 0 ? 5 : Math.max(12, (item.amount / max) * 100);
          return (
            <div className="hotel-dashboard-bar-column" key={item.key}>
              <div className="hotel-dashboard-bar-value">
                {item.amount > 0 ? money(item.amount) : ""}
              </div>
              <div className="hotel-dashboard-bar-track">
                <div
                  className="hotel-dashboard-bar"
                  style={{ height: `${height}%` }}
                  title={`${item.label}: ${money(item.amount)}`}
                />
              </div>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OccupancyDonut({ occupied, ready, cleaning, maintenance }) {
  const total = occupied + ready + cleaning + maintenance;
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="hotel-dashboard-occupancy">
      <div
        className="hotel-dashboard-donut"
        style={{ "--occupancy-angle": `${rate * 3.6}deg` }}
      >
        <div>
          <strong>{rate}%</strong>
          <span>Lấp đầy</span>
        </div>
      </div>

      <div className="hotel-dashboard-legend">
        <span><i className="occupied" /> Đang ở <strong>{occupied}</strong></span>
        <span><i className="ready" /> Sẵn sàng <strong>{ready}</strong></span>
        <span><i className="cleaning" /> Đang dọn <strong>{cleaning}</strong></span>
        <span><i className="maintenance" /> Bảo trì <strong>{maintenance}</strong></span>
      </div>
    </div>
  );
}

export default function HotelAdminDashboard() {
  const location = useLocation();
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stays, setStays] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    const [hotelData, stayData, walletData, transactionData] = await Promise.all([
      getMyHotels(),
      getCurrentHotelStays().catch(() => []),
      getMyWallet().catch(() => null),
      getMyWalletTransactions().catch(() => []),
    ]);

    const safeHotels = (Array.isArray(hotelData) ? hotelData : [])
      .filter((hotel) => hotel.approvalStatus === "APPROVED" && hotel.status === "ACTIVE");

    setHotels(safeHotels);
    setStays(Array.isArray(stayData) ? stayData : []);
    setWallet(walletData);
    setWalletTransactions(Array.isArray(transactionData) ? transactionData : []);
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
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải dữ liệu Dashboard Hotel Admin.",
      );
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
      setError(
        requestError.response?.data?.message
          ?? "Không thể làm mới Dashboard.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function changeHotel(hotelId) {
    setSelectedHotelId(hotelId);
    setRefreshing(true);
    setError("");
    try {
      await loadHotel(hotelId);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải dữ liệu khách sạn đã chọn.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === selectedHotelId) ?? null,
    [hotels, selectedHotelId],
  );

  const today = useMemo(() => new Date(), []);

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

  const bookingStats = useMemo(() => {
    const activeStatuses = new Set(["CONFIRMED", "CHECKED_IN"]);
    const arrivals = bookings.filter(
      (booking) => sameDay(booking.checkIn, today) && activeStatuses.has(booking.status),
    );
    const departures = bookings.filter(
      (booking) => sameDay(booking.checkOut, today)
        && ["CHECKED_IN", "CHECKED_OUT"].includes(booking.status),
    );
    const createdToday = bookings.filter((booking) => sameDay(booking.createdAt, today));
    const monthBookings = bookings.filter((booking) => sameMonth(booking.createdAt, today));
    const cancelledThisMonth = monthBookings.filter((booking) => booking.status === "CANCELLED");

    return {
      arrivals,
      departures,
      createdToday,
      cancellationRate: monthBookings.length
        ? Math.round((cancelledThisMonth.length / monthBookings.length) * 100)
        : 0,
    };
  }, [bookings, today]);

  const selectedHotelStays = useMemo(
    () => stays.filter((item) => item.booking?.hotelId === selectedHotelId),
    [stays, selectedHotelId],
  );

  const revenue = useMemo(() => {
    const events = revenueEvents(walletTransactions);
    const sum = (predicate) => events
      .filter((event) => predicate(event.createdAt))
      .reduce((total, event) => total + Number(event.amount ?? 0), 0);

    return {
      today: sum((value) => sameDay(value, today)),
      month: sum((value) => sameMonth(value, today)),
      year: sum((value) => sameYear(value, today)),
      chart: lastDaysRevenue(events, 7),
    };
  }, [walletTransactions, today]);

  const recentBookings = useMemo(
    () => [...bookings]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6),
    [bookings],
  );

  useEffect(() => {
    if (!location.hash || loading) return undefined;

    const timer = window.setTimeout(() => {
      scrollToHashTarget(location.hash);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [location.hash, loading, bookings]);

  const todayTimeline = useMemo(() => {
    const arrivals = bookingStats.arrivals.map((booking) => ({
      id: `in-${booking.id}`,
      type: "checkin",
      title: guestName(booking),
      subtitle: `Nhận phòng · ${booking.bookingCode}`,
      booking,
    }));
    const departures = bookingStats.departures.map((booking) => ({
      id: `out-${booking.id}`,
      type: "checkout",
      title: guestName(booking),
      subtitle: `Trả phòng · ${booking.bookingCode}`,
      booking,
    }));
    return [...arrivals, ...departures].slice(0, 8);
  }, [bookingStats]);

  if (loading) {
    return <Loading message="Đang tổng hợp số liệu vận hành khách sạn..." />;
  }

  if (hotels.length === 0) {
    return (
      <div className="hotel-dashboard-v2">
        <section className="hotel-dashboard-heading">
          <div>
            <span className="hotel-dashboard-kicker">TRUNG TÂM VẬN HÀNH</span>
            <h1>Tổng quan Hotel Admin</h1>
            <p>Bạn cần có ít nhất một khách sạn đã được duyệt để xem Dashboard vận hành.</p>
          </div>
        </section>
        <section className="hotel-dashboard-empty">
          <Hotel size={48} />
          <h2>Chưa có khách sạn đang hoạt động</h2>
          <p>Hãy đăng ký khách sạn hoặc chờ System Admin duyệt hồ sơ hiện tại.</p>
          <Link to="/hotel-admin/hotels/create">Đăng ký khách sạn</Link>
        </section>
      </div>
    );
  }

  return (
    <main className="hotel-dashboard-v2">
      <section className="hotel-dashboard-heading">
        <div>
          <span className="hotel-dashboard-kicker">TRUNG TÂM VẬN HÀNH</span>
          <h1>Tổng quan khách sạn</h1>
          <p>Theo dõi doanh thu, booking, khách lưu trú và tình trạng phòng bằng dữ liệu thật.</p>
        </div>

        <div className="hotel-dashboard-heading-actions">
          {hotels.length > 1 ? (
            <label className="hotel-dashboard-hotel-select">
              <span>Khách sạn</span>
              <select
                value={selectedHotelId}
                onChange={(event) => void changeHotel(event.target.value)}
              >
                {hotels.map((hotel) => (
                  <option value={hotel.id} key={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="hotel-dashboard-current-hotel">
              <Hotel size={18} />
              <div>
                <small>Đang xem</small>
                <strong>{selectedHotel?.name}</strong>
              </div>
            </div>
          )}

          <button
            className="hotel-dashboard-refresh"
            type="button"
            disabled={refreshing}
            onClick={() => void refreshAll()}
          >
            <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            Làm mới
          </button>
        </div>
      </section>

      <ErrorMessage message={error} />

      <section className="hotel-dashboard-revenue-grid">
        <article className="hotel-dashboard-revenue-card primary">
          <div className="hotel-dashboard-card-icon"><CircleDollarSign size={23} /></div>
          <div>
            <span>Doanh thu hôm nay</span>
            <strong>{money(revenue.today)}</strong>
            <small>Doanh thu ròng vào ví đối tác</small>
          </div>
        </article>

        <article className="hotel-dashboard-revenue-card">
          <div className="hotel-dashboard-card-icon"><TrendingUp size={23} /></div>
          <div>
            <span>Doanh thu tháng này</span>
            <strong>{money(revenue.month)}</strong>
            <small>{new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(today)}</small>
          </div>
        </article>

        <article className="hotel-dashboard-revenue-card">
          <div className="hotel-dashboard-card-icon"><WalletCards size={23} /></div>
          <div>
            <span>Số dư khả dụng</span>
            <strong>{money(wallet?.availableBalance)}</strong>
            <small>Đang giữ: {money(wallet?.pendingBalance)}</small>
          </div>
        </article>

        <article className="hotel-dashboard-revenue-card">
          <div className="hotel-dashboard-card-icon"><CalendarCheck2 size={23} /></div>
          <div>
            <span>Booking tạo hôm nay</span>
            <strong>{bookingStats.createdToday.length}</strong>
            <small>Tỷ lệ hủy tháng: {bookingStats.cancellationRate}%</small>
          </div>
        </article>
      </section>

      <section className="hotel-dashboard-operation-grid">
        <Link to="/hotel-admin/current-stays" className="hotel-dashboard-operation-card">
          <span className="blue"><Users size={22} /></span>
          <div><small>Đang lưu trú</small><strong>{selectedHotelStays.length}</strong></div>
          <ChevronRight size={19} />
        </Link>

        <article className="hotel-dashboard-operation-card">
          <span className="green"><DoorOpen size={22} /></span>
          <div><small>Phòng sẵn sàng</small><strong>{roomStats.available}</strong></div>
          <span className="hotel-dashboard-operation-note">/{roomStats.total}</span>
        </article>

        <Link to="/hotel-admin/rooms?status=CLEANING" className="hotel-dashboard-operation-card">
          <span className="orange"><Sparkles size={22} /></span>
          <div><small>Phòng cần dọn</small><strong>{roomStats.cleaning}</strong></div>
          <ChevronRight size={19} />
        </Link>

        <Link to="/hotel-admin/rooms?status=MAINTENANCE" className="hotel-dashboard-operation-card">
          <span className="red"><Wrench size={22} /></span>
          <div><small>Phòng bảo trì</small><strong>{roomStats.maintenance}</strong></div>
          <ChevronRight size={19} />
        </Link>

        <article className="hotel-dashboard-operation-card">
          <span className="purple"><CalendarClock size={22} /></span>
          <div><small>Khách đến hôm nay</small><strong>{bookingStats.arrivals.length}</strong></div>
          <span className="hotel-dashboard-operation-note">check-in</span>
        </article>

        <article className="hotel-dashboard-operation-card">
          <span className="teal"><CheckCircle2 size={22} /></span>
          <div><small>Khách trả hôm nay</small><strong>{bookingStats.departures.length}</strong></div>
          <span className="hotel-dashboard-operation-note">checkout</span>
        </article>
      </section>

      <section className="hotel-dashboard-main-grid">
        <article className="hotel-dashboard-panel revenue-panel">
          <header>
            <div>
              <span>DOANH THU</span>
              <h2>7 ngày gần nhất</h2>
            </div>
            <div className="hotel-dashboard-year-total">
              <small>Từ đầu năm</small>
              <strong>{money(revenue.year)}</strong>
            </div>
          </header>
          <MiniRevenueChart data={revenue.chart} />
        </article>

        <article className="hotel-dashboard-panel occupancy-panel">
          <header>
            <div>
              <span>CÔNG SUẤT PHÒNG</span>
              <h2>Tình trạng hiện tại</h2>
            </div>
            <Link to="/hotel-admin/rooms">Quản lý phòng</Link>
          </header>

          <OccupancyDonut
            occupied={roomStats.occupied}
            ready={roomStats.available}
            cleaning={roomStats.cleaning}
            maintenance={roomStats.maintenance}
          />
          <div className="hotel-dashboard-room-meta">
            <span>{roomTypes.length} loại phòng</span>
            <span>{roomStats.inactive} phòng ngừng hoạt động</span>
          </div>
        </article>
      </section>

      <section className="hotel-dashboard-lower-grid">
        <article className="hotel-dashboard-panel">
          <header>
            <div>
              <span>LỊCH HÔM NAY</span>
              <h2>Khách đến & trả phòng</h2>
            </div>
          </header>

          {todayTimeline.length === 0 ? (
            <div className="hotel-dashboard-panel-empty">
              <CalendarCheck2 size={34} />
              <p>Hôm nay chưa có lịch check-in/check-out.</p>
            </div>
          ) : (
            <div className="hotel-dashboard-timeline">
              {todayTimeline.map((item) => {
                const room = rooms.find((candidate) => candidate.id === item.booking.roomId);
                return (
                  <div className="hotel-dashboard-timeline-row" key={item.id}>
                    <span className={`hotel-dashboard-timeline-icon ${item.type}`}>
                      {item.type === "checkin" ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </div>
                    <div className="hotel-dashboard-timeline-room">
                      <small>Phòng</small>
                      <strong>{room?.roomNumber ?? "—"}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="hotel-dashboard-panel" id="recent-bookings">
          <header>
            <div>
              <span>BOOKING</span>
              <h2>Đơn gần đây</h2>
            </div>
            <span className="hotel-dashboard-header-count">{bookings.length} đơn</span>
          </header>

          {recentBookings.length === 0 ? (
            <div className="hotel-dashboard-panel-empty">
              <BedDouble size={34} />
              <p>Khách sạn chưa có booking.</p>
            </div>
          ) : (
            <div className="hotel-dashboard-booking-list">
              {recentBookings.map((booking) => {
                const room = rooms.find((candidate) => candidate.id === booking.roomId);
                return (
                  <div className="hotel-dashboard-booking-row" key={booking.id}>
                    <div className="hotel-dashboard-booking-main">
                      <strong>{guestName(booking)}</strong>
                      <span>{booking.bookingCode}</span>
                    </div>
                    <div className="hotel-dashboard-booking-dates">
                      <span>{formatDate(booking.checkIn)}</span>
                      <ChevronRight size={13} />
                      <span>{formatDate(booking.checkOut)}</span>
                    </div>
                    <div className="hotel-dashboard-booking-room">
                      <small>Phòng</small>
                      <strong>{room?.roomNumber ?? "—"}</strong>
                    </div>
                    <div className={`hotel-dashboard-booking-status ${BOOKING_TONE[booking.status] ?? ""}`}>
                      {BOOKING_STATUS[booking.status] ?? booking.status}
                    </div>
                    <strong className="hotel-dashboard-booking-money">{money(booking.totalPrice)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="hotel-dashboard-quick-links">
        <Link to="/hotel-admin/check-in">
          <CalendarCheck2 size={20} />
          <div><strong>Nhận phòng QR</strong><span>Quét mã và check-in khách</span></div>
          <ChevronRight size={18} />
        </Link>
        <Link to="/hotel-admin/current-stays">
          <Users size={20} />
          <div><strong>Khách đang lưu trú</strong><span>{selectedHotelStays.length} khách/phòng đang ở</span></div>
          <ChevronRight size={18} />
        </Link>
        <Link to="/hotel-admin/wallet">
          <WalletCards size={20} />
          <div><strong>Ví & rút tiền</strong><span>{money(wallet?.availableBalance)} khả dụng</span></div>
          <ChevronRight size={18} />
        </Link>
      </section>
    </main>
  );
}
