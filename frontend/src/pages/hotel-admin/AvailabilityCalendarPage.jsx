import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import {
  getHotelAvailabilityCalendar,
  subscribeHotelAvailability,
} from "../../services/bookingService";
import {
  completeRoomCleaning,
  getMyHotels,
  getRoomTypes,
  updateRoom,
} from "../../services/hotelAdminService";

import "./AvailabilityCalendarPage.css";

const DAY_OPTIONS = [7, 14, 30];
const ACTIVE_BOOKING_STATUSES = new Set([
  "PENDING",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
]);

const CELL_META = {
  AVAILABLE: { label: "Trống", detail: "Sẵn sàng", icon: CheckCircle2 },
  BOOKED: { label: "Đã đặt", detail: "Chờ nhận phòng", icon: CalendarDays },
  OCCUPIED: { label: "Đang ở", detail: "Khách đang lưu trú", icon: BedDouble },
  HOLD: { label: "Đang giữ", detail: "Giữ chỗ tạm thời", icon: Clock3 },
  CLEANING: { label: "Đang dọn", detail: "Chờ buồng phòng", icon: Sparkles },
  MAINTENANCE: { label: "Bảo trì", detail: "Không mở bán", icon: Wrench },
  INACTIVE: { label: "Ngừng HĐ", detail: "Không mở bán", icon: CircleAlert },
};

function localIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function addDays(value, amount) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function dateRange(from, days) {
  return Array.from({ length: days }, (_, index) => localIso(addDays(from, index)));
}

function formatDay(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(parseDate(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(parseDate(value));
}

function isDateInStay(date, checkIn, checkOut) {
  return date >= checkIn && date < checkOut;
}

function errorMessage(error) {
  return error.response?.data?.message ?? "Không thể tải lịch phòng lúc này.";
}

function roomCell(room, date, bookings, holds, today) {
  const booking = bookings.find(
    (item) => item.roomId === room.id
      && ACTIVE_BOOKING_STATUSES.has(item.status)
      && isDateInStay(date, item.checkIn, item.checkOut),
  );

  if (booking) {
    if (booking.status === "CHECKED_OUT" && date === today && room.status === "CLEANING") {
      return { status: "CLEANING", ...CELL_META.CLEANING, detail: "Khách đã trả phòng" };
    }
    const status = booking.status === "CHECKED_IN"
      ? "OCCUPIED"
      : booking.status === "PENDING_PAYMENT"
        ? "HOLD"
        : "BOOKED";
    return {
      status,
      booking,
      label: booking.status === "CHECKED_OUT" ? "Đã trả phòng" : CELL_META[status].label,
      detail: booking.guestName || booking.bookingCode,
      warning: room.status === "MAINTENANCE" ? "Phòng đang bảo trì" : "",
    };
  }

  if (["MAINTENANCE", "INACTIVE"].includes(room.status)) {
    return { status: room.status, ...CELL_META[room.status] };
  }

  const hold = holds.find(
    (item) => item.roomId === room.id && isDateInStay(date, item.checkIn, item.checkOut),
  );
  if (hold) {
    return { status: "HOLD", hold, ...CELL_META.HOLD };
  }

  if (date === today && ["CLEANING", "OCCUPIED"].includes(room.status)) {
    return { status: room.status, ...CELL_META[room.status] };
  }
  return { status: "AVAILABLE", ...CELL_META.AVAILABLE };
}

export default function AvailabilityCalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestRef = useRef(0);
  const today = localIso(new Date());
  const initialDays = DAY_OPTIONS.includes(Number(searchParams.get("days")))
    ? Number(searchParams.get("days"))
    : 14;

  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState(searchParams.get("hotelId") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? today);
  const [days, setDays] = useState(initialDays);
  const [calendar, setCalendar] = useState({ rooms: [], bookings: [], holds: [] });
  const [roomTypes, setRoomTypes] = useState([]);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingRoomId, setWorkingRoomId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const dates = useMemo(() => dateRange(from, days), [from, days]);
  const to = dates.at(-1) ?? from;
  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [type.id, type])),
    [roomTypes],
  );

  const sortedRooms = useMemo(
    () => [...(calendar.rooms ?? [])].sort((left, right) => {
      const floorOrder = Number(left.floor ?? 0) - Number(right.floor ?? 0);
      return floorOrder || String(left.roomNumber).localeCompare(
        String(right.roomNumber),
        "vi",
        { numeric: true },
      );
    }),
    [calendar.rooms],
  );
  const visibleRooms = useMemo(
    () => roomTypeId
      ? sortedRooms.filter((room) => room.roomTypeId === roomTypeId)
      : sortedRooms,
    [roomTypeId, sortedRooms],
  );

  const operationalRooms = useMemo(
    () => visibleRooms.filter((room) => ["CLEANING", "MAINTENANCE"].includes(room.status)),
    [visibleRooms],
  );

  const summary = useMemo(() => ({
    total: visibleRooms.length,
    bookedInRange: visibleRooms.filter((room) => (
      (calendar.bookings ?? []).some((booking) => (
        booking.roomId === room.id && booking.checkIn <= to && booking.checkOut > from
      ))
    )).length,
    cleaning: visibleRooms.filter((room) => room.status === "CLEANING").length,
    maintenance: visibleRooms.filter((room) => room.status === "MAINTENANCE").length,
  }), [calendar.bookings, from, to, visibleRooms]);

  const loadCalendar = useCallback(async (silent = false) => {
    if (!hotelId) {
      setCalendar({ rooms: [], bookings: [], holds: [] });
      setRoomTypes([]);
      setLoading(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [calendarPayload, roomTypePayload] = await Promise.all([
        getHotelAvailabilityCalendar(hotelId, from, to),
        getRoomTypes(hotelId),
      ]);
      if (requestRef.current !== requestId) return;
      setCalendar({
        ...calendarPayload,
        rooms: Array.isArray(calendarPayload?.rooms) ? calendarPayload.rooms : [],
        bookings: Array.isArray(calendarPayload?.bookings) ? calendarPayload.bookings : [],
        holds: Array.isArray(calendarPayload?.holds) ? calendarPayload.holds : [],
      });
      setRoomTypes(Array.isArray(roomTypePayload) ? roomTypePayload : []);
    } catch (requestError) {
      if (requestRef.current === requestId) setError(errorMessage(requestError));
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [from, hotelId, to]);

  useEffect(() => {
    let active = true;
    getMyHotels()
      .then((payload) => {
        if (!active) return;
        const nextHotels = Array.isArray(payload) ? payload : [];
        setHotels(nextHotels);
        setHotelId((current) => (
          nextHotels.some((hotel) => hotel.id === current) ? current : nextHotels[0]?.id ?? ""
        ));
      })
      .catch((requestError) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (hotelId) next.set("hotelId", hotelId);
    else next.delete("hotelId");
    next.set("from", from);
    next.set("days", String(days));
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [days, from, hotelId, searchParams, setSearchParams]);

  useEffect(() => subscribeHotelAvailability(
    hotelId,
    () => void loadCalendar(true),
  ), [hotelId, loadCalendar]);

  useEffect(() => {
    if (!calendar.holds?.length) return undefined;
    const timer = window.setInterval(() => void loadCalendar(true), 30_000);
    return () => window.clearInterval(timer);
  }, [calendar.holds, loadCalendar]);

  async function changeRoomStatus(room, status) {
    const action = status === "MAINTENANCE" ? "đưa vào bảo trì" : "mở bán lại";
    if (!window.confirm(`Xác nhận ${action} phòng ${room.roomNumber}?`)) return;

    setWorkingRoomId(room.id);
    setError("");
    setMessage("");
    try {
      await updateRoom(room.id, {
        roomTypeId: room.roomTypeId,
        roomNumber: room.roomNumber,
        floor: room.floor,
        status,
        customPrice: room.customPrice ?? null,
        note: room.note ?? null,
      });
      setMessage(
        status === "MAINTENANCE"
          ? `Phòng ${room.roomNumber} đã chuyển sang bảo trì và không thể nhận booking mới.`
          : `Phòng ${room.roomNumber} đã sẵn sàng mở bán lại.`,
      );
      await loadCalendar(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorkingRoomId("");
    }
  }

  async function finishCleaning(room) {
    if (!window.confirm(`Xác nhận phòng ${room.roomNumber} đã dọn xong?`)) return;
    setWorkingRoomId(room.id);
    setError("");
    setMessage("");
    try {
      await completeRoomCleaning(room.id);
      setMessage(`Phòng ${room.roomNumber} đã sạch và sẵn sàng đón khách.`);
      await loadCalendar(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorkingRoomId("");
    }
  }

  if (loading && hotels.length === 0) return <Loading label="Đang tải lịch phòng..." />;

  return (
    <div className="availability-page">
      <header className="availability-heading">
        <div>
          <span className="availability-kicker">VẬN HÀNH PHÒNG</span>
          <h1>Lịch phòng & buồng phòng</h1>
          <p>Theo dõi booking, khách đang ở, phòng trống, dọn phòng và bảo trì trên cùng một lịch.</p>
        </div>
        <button
          type="button"
          className="availability-refresh"
          disabled={!hotelId || refreshing}
          onClick={() => void loadCalendar(true)}
        >
          <RefreshCw size={17} className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "Đang cập nhật" : "Cập nhật"}
        </button>
      </header>

      {error ? <div className="availability-notice error" role="alert">{error}</div> : null}
      {message ? <div className="availability-notice success" role="status">{message}</div> : null}

      <section className="availability-toolbar" aria-label="Bộ lọc lịch phòng">
        <label>
          <span>Khách sạn</span>
          <select value={hotelId} onChange={(event) => {
            setHotelId(event.target.value);
            setRoomTypeId("");
          }}>
            {hotels.map((hotel) => <option value={hotel.id} key={hotel.id}>{hotel.name}</option>)}
          </select>
        </label>
        <label>
          <span>Loại phòng</span>
          <select value={roomTypeId} onChange={(event) => setRoomTypeId(event.target.value)}>
            <option value="">Tất cả loại phòng</option>
            {roomTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}
          </select>
        </label>
        <label>
          <span>Từ ngày</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Khoảng xem</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {DAY_OPTIONS.map((value) => <option value={value} key={value}>{value} ngày</option>)}
          </select>
        </label>
        <div className="availability-date-nav" aria-label="Điều hướng ngày">
          <button type="button" aria-label="Lùi 7 ngày" onClick={() => setFrom(localIso(addDays(from, -7)))}><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setFrom(today)}>Hôm nay</button>
          <button type="button" aria-label="Tiến 7 ngày" onClick={() => setFrom(localIso(addDays(from, 7)))}><ChevronRight size={18} /></button>
        </div>
      </section>

      <section className="availability-summary" aria-label="Tóm tắt vận hành">
        <article><CalendarDays size={20} /><span><small>Tổng phòng</small><strong>{summary.total}</strong></span></article>
        <article><BedDouble size={20} /><span><small>Có booking trong kỳ</small><strong>{summary.bookedInRange}</strong></span></article>
        <article><Sparkles size={20} /><span><small>Chờ dọn</small><strong>{summary.cleaning}</strong></span></article>
        <article><Wrench size={20} /><span><small>Bảo trì</small><strong>{summary.maintenance}</strong></span></article>
      </section>

      <section className="availability-calendar-card">
        <div className="availability-section-head">
          <div>
            <span>{formatShortDate(from)} – {formatShortDate(to)}</span>
            <h2>Lịch theo từng phòng</h2>
          </div>
          <div className="availability-legend" aria-label="Chú giải trạng thái">
            {Object.entries(CELL_META).map(([status, meta]) => (
              <span className={`status-${status.toLowerCase()}`} key={status}><i />{meta.label}</span>
            ))}
          </div>
        </div>

        {loading ? <Loading label="Đang đồng bộ dữ liệu thật..." /> : visibleRooms.length === 0 ? (
          <div className="availability-empty">Không có phòng phù hợp để hiển thị.</div>
        ) : (
          <div className="availability-grid-wrap">
            <div
              className="availability-grid"
              style={{ "--calendar-days": dates.length }}
              role="table"
              aria-label={`Lịch phòng từ ${from} đến ${to}`}
            >
              <div className="availability-room-head" role="columnheader">Phòng</div>
              {dates.map((date) => (
                <div className={`availability-day-head ${date === today ? "is-today" : ""}`} role="columnheader" key={date}>
                  <span>{formatDay(date)}</span>
                  {date === today ? <small>Hôm nay</small> : null}
                </div>
              ))}

              {visibleRooms.flatMap((room) => {
                const type = roomTypeMap[room.roomTypeId];
                return [
                  <div className="availability-room-cell" role="rowheader" key={`${room.id}-room`}>
                    <strong>{room.roomNumber}</strong>
                    <span>{type?.name ?? "Loại phòng"} · Tầng {room.floor ?? "—"}</span>
                    <div className="availability-room-actions">
                      {room.status === "AVAILABLE" ? (
                        <button type="button" disabled={workingRoomId === room.id} onClick={() => void changeRoomStatus(room, "MAINTENANCE")}>
                          <Wrench size={13} /> Bảo trì
                        </button>
                      ) : null}
                      {room.status === "MAINTENANCE" ? (
                        <button type="button" disabled={workingRoomId === room.id} onClick={() => void changeRoomStatus(room, "AVAILABLE")}>
                          <CheckCircle2 size={13} /> Mở lại
                        </button>
                      ) : null}
                    </div>
                  </div>,
                  ...dates.map((date) => {
                    const cell = roomCell(
                      room,
                      date,
                      calendar.bookings ?? [],
                      calendar.holds ?? [],
                      today,
                    );
                    const Icon = CELL_META[cell.status].icon;
                    const title = cell.booking
                      ? `${cell.booking.bookingCode} · ${cell.booking.guestName || "Khách lưu trú"} · ${cell.booking.checkIn} → ${cell.booking.checkOut}`
                      : `${CELL_META[cell.status].label}: ${CELL_META[cell.status].detail}`;
                    return (
                      <div className={`availability-day-cell status-${cell.status.toLowerCase()} ${cell.warning ? "has-warning" : ""}`} role="cell" title={title} key={`${room.id}-${date}`}>
                        <Icon size={14} />
                        <strong>{cell.label}</strong>
                        <span>{cell.detail}</span>
                        {cell.booking ? <small>{cell.booking.bookingCode}</small> : null}
                        {cell.warning ? <small className="cell-warning">{cell.warning}</small> : null}
                      </div>
                    );
                  }),
                ];
              })}
            </div>
          </div>
        )}
      </section>

      <section className="housekeeping-card">
        <div className="availability-section-head">
          <div>
            <span>HOUSEKEEPING</span>
            <h2>Hàng đợi buồng phòng & bảo trì</h2>
          </div>
          <small>{operationalRooms.length} phòng cần theo dõi</small>
        </div>
        {operationalRooms.length === 0 ? (
          <div className="availability-empty compact"><CheckCircle2 size={22} /> Không có phòng chờ dọn hoặc bảo trì.</div>
        ) : (
          <div className="housekeeping-list">
            {operationalRooms.map((room) => {
              const cleaning = room.status === "CLEANING";
              return (
                <article className={cleaning ? "cleaning" : "maintenance"} key={room.id}>
                  <div className="housekeeping-icon">{cleaning ? <Sparkles size={20} /> : <Wrench size={20} />}</div>
                  <div>
                    <strong>Phòng {room.roomNumber}</strong>
                    <span>{roomTypeMap[room.roomTypeId]?.name ?? "Loại phòng"} · Tầng {room.floor ?? "—"}</span>
                    <small>{cleaning ? "Phát sinh tự động sau checkout" : room.note || "Đang tạm ngừng mở bán"}</small>
                  </div>
                  <button
                    type="button"
                    disabled={workingRoomId === room.id}
                    onClick={() => void (cleaning ? finishCleaning(room) : changeRoomStatus(room, "AVAILABLE"))}
                  >
                    <CheckCircle2 size={16} />
                    {workingRoomId === room.id ? "Đang xử lý..." : cleaning ? "Đã dọn xong" : "Hoàn tất bảo trì"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
