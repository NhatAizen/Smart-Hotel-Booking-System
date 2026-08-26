import {
  BedDouble,
  CalendarCheck2,
  CheckCircle2,
  Home,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { StatusBadge } from "../../components/ui";
import {
  getBooking,
  getBookingQrBlob,
} from "../../services/bookingService";
import "./BookingCheckoutPage.css";

function money(value) {
  return `${Math.round(Number(value ?? 0)).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`;
}

function BookingQrImage({ booking }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let objectUrl = "";
    let active = true;

    getBookingQrBlob(booking.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(""));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [booking.id]);

  return src ? (
    <img
      src={src}
      alt={`QR check-in ${booking.bookingCode}`}
      width="116"
      height="116"
    />
  ) : (
    <div className="booking-qr-placeholder">QR</div>
  );
}

export default function BookingSuccessPage() {
  const [searchParams] = useSearchParams();
  const bookingIds = useMemo(
    () =>
      (searchParams.get("bookingIds") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [searchParams],
  );
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await Promise.all(bookingIds.map(getBooking));
        setBookings(data);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ??
            "Không thể tải thông tin booking vừa tạo.",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookingIds]);

  const totals = bookings.reduce(
    (result, booking) => ({
      total: result.total + Number(booking.totalPrice ?? 0),
      paid: result.paid + Number(booking.paidAmount ?? 0),
      remaining: result.remaining + Number(booking.remainingAmount ?? 0),
    }),
    { total: 0, paid: 0, remaining: 0 },
  );

  const checkoutSnapshot = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("enziuroomsLastCheckout") ?? "{}");
    } catch {
      return {};
    }
  }, []);

  if (loading) return <Loading message="Đang xác nhận booking..." />;

  return (
    <main className="booking-success-page">
      <div className="container booking-success-shell">
        <ErrorMessage message={error} />

        <section className="booking-success-card">
          <div className="booking-success-icon">
            <CheckCircle2 size={58} />
          </div>
          <span>ĐẶT PHÒNG THÀNH CÔNG</span>
          <h1>Phòng đã được xác nhận</h1>
          <p>
            {checkoutSnapshot.hotelName
              ? `Cảm ơn bạn đã đặt phòng tại ${checkoutSnapshot.hotelName}.`
              : "Cảm ơn bạn đã đặt phòng trên EnziuRooms."}
          </p>

          <div className="booking-success-totals">
            <div>
              <ReceiptText size={21} />
              <span>Tổng booking</span>
              <strong>{money(totals.total)}</strong>
            </div>
            <div>
              <WalletCards size={21} />
              <span>Đã thanh toán</span>
              <strong>{money(totals.paid)}</strong>
            </div>
            <div>
              <CalendarCheck2 size={21} />
              <span>Còn phải thanh toán</span>
              <strong>{money(totals.remaining)}</strong>
            </div>
          </div>

          <div className="booking-success-list">
            {bookings.map((booking) => (
              <article key={booking.id}>
                <div>
                  <small>Mã booking</small>
                  <strong>{booking.bookingCode}</strong>
                  <div className="booking-success-booking-meta">
                    <span className="booking-success-stay-dates">
                      {booking.checkIn} → {booking.checkOut}
                    </span>
                    <StatusBadge
                      status={booking.status}
                      size="sm"
                      className="booking-success-status"
                    />
                  </div>
                </div>
                <div className="booking-checkin-qr">
                  <BookingQrImage booking={booking} />
                  <small>QR check-in</small>
                </div>
              </article>
            ))}
          </div>

          <div className="booking-success-actions">
            <Link to="/customer/bookings">
              <BedDouble size={18} /> Xem đơn đặt phòng
            </Link>
            <Link to="/">
              <Home size={18} /> Về trang chủ
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
