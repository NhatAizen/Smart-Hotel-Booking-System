import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getMyBookings } from "../../services/bookingService";
import { friendlyErrorMessage } from "../../utils/userFacingText";

function money(value) {
  return `${Math.round(Number(value ?? 0)).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`;
}

function statusLabel(value) {
  return (
    {
      PENDING: "Chờ xác nhận",
      PENDING_PAYMENT: "Chờ thanh toán",
      CONFIRMED: "Đã xác nhận",
      CHECKED_IN: "Đang lưu trú",
      CHECKED_OUT: "Đã trả phòng",
      NO_SHOW: "Không đến nhận phòng",
      CANCELLED: "Đã hủy",
    }[value] ?? value ?? "Chưa xác định"
  );
}

function statusTone(value) {
  if (["CONFIRMED", "CHECKED_IN"].includes(value)) return "success";
  if (["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(value)) return "neutral";
  return "warning";
}

export default function BookingQuickPanel({ customerId, open }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    if (!open || !customerId) return undefined;

    let active = true;
    setLoading(true);
    setError("");

    getMyBookings(customerId)
      .then((data) => {
        if (!active) return;
        setBookings(Array.isArray(data) ? data.slice(0, 5) : []);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError.response?.data?.message
            ?? "Không thể tải nhanh đơn đặt phòng.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId, open]);

  const summary = useMemo(() => {
    const activeCount = bookings.filter((booking) =>
      ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"].includes(booking.status),
    ).length;
    const unpaid = bookings.reduce(
      (total, booking) => total + Number(booking.remainingAmount ?? 0),
      0,
    );
    return { activeCount, unpaid };
  }, [bookings]);

  if (!open) return null;

  return (
    <div className="booking-quick-panel" role="dialog" aria-label="Đơn đặt phòng gần đây">
      <div className="booking-quick-header">
        <div>
          <span>ĐƠN ĐẶT PHÒNG</span>
          <strong>Đơn gần đây</strong>
        </div>
        <div className="booking-quick-summary">
          <small>{summary.activeCount} đơn đang hoạt động</small>
          <small>Còn lại {money(summary.unpaid)}</small>
        </div>
      </div>

      {loading ? (
        <div className="booking-quick-state">
          <LoaderCircle className="spin" size={22} />
          Đang tải đơn đặt phòng...
        </div>
      ) : null}

      {error ? <div className="booking-quick-error">{friendlyErrorMessage(error, "Chưa thể tải đơn đặt phòng lúc này.")}</div> : null}

      {!loading && !error && bookings.length === 0 ? (
        <div className="booking-quick-state">Bạn chưa có đơn đặt phòng nào.</div>
      ) : null}

      <div className="booking-quick-list">
        {bookings.map((booking) => {
          const expanded = expandedId === booking.id;
          return (
            <article key={booking.id} className={expanded ? "expanded" : ""}>
              <button
                type="button"
                className="booking-quick-row"
                onClick={() => setExpandedId(expanded ? "" : booking.id)}
              >
                <div className="booking-quick-code">
                  <strong>{booking.bookingCode ?? booking.id}</strong>
                  <span>
                    <CalendarDays size={14} />
                    {booking.checkIn} → {booking.checkOut}
                  </span>
                </div>
                <div className="booking-quick-row-end">
                  <span className={`booking-quick-status ${statusTone(booking.status)}`}>
                    {statusLabel(booking.status)}
                  </span>
                  {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </div>
              </button>

              {expanded ? (
                <div className="booking-quick-details">
                  <span>
                    <ReceiptText size={15} /> Tổng tiền: {money(booking.totalPrice)}
                  </span>
                  <span>
                    <CircleDollarSign size={15} /> Đã trả: {money(booking.paidAmount)}
                  </span>
                  <strong>Còn lại: {money(booking.remainingAmount)}</strong>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
