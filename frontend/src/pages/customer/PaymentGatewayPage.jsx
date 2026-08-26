import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import ErrorMessage from "../../components/common/ErrorMessage";
import { StatusBadge } from "../../components/ui";
import {
  cancelPayOsOrder,
  getPayOsOrder,
  syncPayOsOrder,
} from "../../services/paymentService";
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";
import "./BookingCheckoutPage.css";

const TERMINAL_STATUSES = new Set(["PAID", "CANCELLED", "EXPIRED", "FAILED", "REFUNDED"]);
const CHECKIN_PAYMENT_CONTEXT_KEY = "enziuroomsHotelCheckInPayment";
const CHECKIN_PAYMENT_CHANNEL = "enziurooms-payos-checkin";
const HOTEL_PAYMENT_RETURN_KEY = "enziuroomsHotelPaymentReturn";

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function readStoredOrder() {
  try {
    return JSON.parse(sessionStorage.getItem("enziuroomsPayOsOrder") ?? "null");
  } catch {
    return null;
  }
}

function readCheckInContext() {
  try {
    return JSON.parse(localStorage.getItem(CHECKIN_PAYMENT_CONTEXT_KEY) ?? "null");
  } catch {
    return null;
  }
}

function readHotelPaymentReturnContext() {
  try {
    const context = JSON.parse(localStorage.getItem(HOTEL_PAYMENT_RETURN_KEY) ?? "null");
    return context?.source === "CURRENT_STAYS" ? context : null;
  } catch {
    return null;
  }
}

function markCurrentStayPaymentPaid(order) {
  const context = readHotelPaymentReturnContext();
  if (!context) return null;
  if (context.orderCode && String(context.orderCode) !== String(order?.orderCode ?? "")) {
    return null;
  }

  const next = {
    ...context,
    status: "PAID",
    paidAt: Date.now(),
    orderCode: order?.orderCode ?? context.orderCode,
  };
  try {
    localStorage.setItem(HOTEL_PAYMENT_RETURN_KEY, JSON.stringify(next));
  } catch {
    // CurrentStaysPage still polls PayOS directly as a fallback.
  }
  return next;
}

function markCheckInPaymentPaid(order) {
  const context = readCheckInContext();
  if (!context) return context;

  const next = {
    ...context,
    status: "PAID",
    pending: true,
    paidAt: Date.now(),
    orderCode: order?.orderCode ?? context.orderCode,
  };

  try {
    localStorage.setItem(CHECKIN_PAYMENT_CONTEXT_KEY, JSON.stringify(next));
  } catch {
    // Best effort.
  }

  return next;
}

function broadcastCheckInPaymentPaid(order, context) {
  if (typeof BroadcastChannel === "undefined") return;

  const channel = new BroadcastChannel(CHECKIN_PAYMENT_CHANNEL);
  channel.postMessage({
    type: "CHECKIN_PAYMENT_PAID",
    orderCode: order?.orderCode,
    bookingId:
      context?.bookingId
      ?? order?.payments?.find?.((payment) => payment?.bookingId)?.bookingId
      ?? null,
  });
  channel.close();
}

function statusCopy(status) {
  if (!status) {
    return {
      icon: LoaderCircle,
      title: "Đang xác minh thanh toán",
      message: "Đang xác nhận giao dịch với PayOS.",
      tone: "processing",
    };
  }

  switch (status) {
    case "PAID":
      return {
        icon: CheckCircle2,
        title: "Thanh toán thành công",
        message: "PayOS đã xác nhận giao dịch. Booking của bạn đang được hoàn tất.",
        tone: "success",
      };
    case "CANCELLED":
      return {
        icon: XCircle,
        title: "Giao dịch đã hủy",
        message: "Bạn chưa bị ghi nhận thanh toán cho giao dịch này.",
        tone: "danger",
      };
    case "EXPIRED":
      return {
        icon: Clock3,
        title: "Link thanh toán đã hết hạn",
        message: "Thời gian giữ phòng đã hết. Vui lòng chọn phòng lại.",
        tone: "danger",
      };
    case "FAILED":
      return {
        icon: XCircle,
        title: "Thanh toán chưa thành công",
        message: "PayOS chưa ghi nhận được giao dịch. Bạn có thể kiểm tra lại hoặc tạo booking mới.",
        tone: "danger",
      };
    case "REFUNDED":
      return {
        icon: CheckCircle2,
        title: "Giao dịch đã được hoàn tiền",
        message: "PayOS đã ghi nhận trạng thái hoàn tiền cho giao dịch này.",
        tone: "success",
      };
    case "PENDING":
    case "PROCESSING":
      return {
        icon: LoaderCircle,
        title: "Đang xác minh thanh toán",
        message: "Đang xác nhận giao dịch với PayOS.",
        tone: "processing",
      };
    default:
      return {
        icon: Clock3,
        title: "Chưa xác định trạng thái giao dịch",
        message: "PayOS trả về trạng thái chưa được EnziuRooms nhận diện. Hãy kiểm tra lại sau ít phút.",
        tone: "neutral",
      };
  }
}

function paymentStatusLabel(status) {
  return STATUS_LABELS[normalizeEnum(status)] ?? "Chưa xác định";
}

function paymentTypeLabel(type) {
  return {
    DEPOSIT: "Đặt cọc online",
    REMAINING_PAYMENT: "Thanh toán phần còn lại",
    WALLET_TOP_UP: "Nạp tiền vào ví khách sạn",
    FULL_PAYMENT: "Thanh toán toàn bộ",
  }[normalizeEnum(type)] ?? "Chưa xác định";
}

export default function PaymentGatewayPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isHotelAdmin = user?.role === "HOTEL_ADMIN";
  const [searchParams] = useSearchParams();
  const stored = useMemo(() => readStoredOrder(), []);
  const hotelReturnContext = useMemo(() => readHotelPaymentReturnContext(), []);
  const orderCode = searchParams.get("orderCode") ?? stored?.orderCode ?? "";
  const bookingIds = useMemo(() => {
    const queryIds = (searchParams.get("bookingIds") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return queryIds.length > 0 ? queryIds : stored?.bookingIds ?? [];
  }, [searchParams, stored]);
  const isCancelReturn = location.pathname.endsWith("/cancel")
    || searchParams.get("cancel") === "true";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const redirected = useRef(false);

  const loadOrder = useCallback(async ({ sync = true } = {}) => {
    if (!orderCode) {
      setError("Không tìm thấy mã giao dịch PayOS. Vui lòng mở lại từ lịch sử đặt phòng.");
      setLoading(false);
      return null;
    }

    setChecking(true);
    setError("");
    try {
      const result = sync
        ? await syncPayOsOrder(orderCode)
        : await getPayOsOrder(orderCode);
      setOrder(result);
      return result;
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.detail
          ?? "Không thể kiểm tra trạng thái giao dịch PayOS.",
      );
      return null;
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [orderCode]);

  useEffect(() => {
    let active = true;
    let timer;
    let attempts = 0;

    async function poll() {
      if (!active) return;
      const result = await loadOrder({ sync: true });
      if (!active || !result) return;

      if (result.status === "PAID") {
        if (!redirected.current) {
          redirected.current = true;
          sessionStorage.removeItem("enziuroomsPayOsOrder");
          const paidBookingIds = bookingIds.length > 0
            ? bookingIds
            : (result.payments ?? []).map((payment) => payment.bookingId).filter(Boolean);
          window.setTimeout(() => {
            if (result.paymentType === "WALLET_TOP_UP") {
              navigate("/hotel-admin/wallet", { replace: true });
              return;
            }

            // Phụ thu trả phòng trễ được mở từ trang Khách đang lưu trú.
            // Giữ tab vận hành hiện tại, đóng tab PayOS sau khi PAID và để trang
            // CurrentStays tự đồng bộ booking/remainingAmount.
            if (
              isHotelAdmin
              && result.paymentType === "REMAINING_PAYMENT"
              && hotelReturnContext?.source === "CURRENT_STAYS"
              && (!hotelReturnContext.orderCode
                || String(hotelReturnContext.orderCode) === String(result.orderCode ?? orderCode))
            ) {
              markCurrentStayPaymentPaid(result);
              window.setTimeout(() => {
                window.close();
                window.setTimeout(() => {
                  if (!window.closed) {
                    navigate(
                      `/hotel-admin/current-stays?payment=paid&bookingId=${encodeURIComponent(hotelReturnContext.bookingId ?? "")}`,
                      { replace: true },
                    );
                  }
                }, 250);
              }, 900);
              return;
            }

            // Thanh toán phần còn lại tại quầy check-in: thông báo realtime cho tab
            // check-in đang mở. Tab đó giữ nguyên booking/QR và tự refresh.
            if (isHotelAdmin && result.paymentType === "REMAINING_PAYMENT") {
              const checkInContext = markCheckInPaymentPaid(result);
              broadcastCheckInPaymentPaid(result, checkInContext);

              window.setTimeout(() => {
                // Đây thường là tab PayOS được mở bằng window.open, nên đóng tab
                // sau khi xác nhận là trải nghiệm quầy chuyên nghiệp nhất.
                window.close();

                // Nếu trình duyệt không cho tự đóng hoặc PayOS được mở cùng tab,
                // phục hồi booking từ context đã lưu, vẫn không cần quét QR lại.
                window.setTimeout(() => {
                  if (!window.closed) {
                    navigate(
                      `/hotel-admin/check-in?resume=1&orderCode=${encodeURIComponent(result.orderCode ?? orderCode)}`,
                      { replace: true },
                    );
                  }
                }, 250);
              }, 900);
              return;
            }

            navigate(
              `/customer/booking-success?bookingIds=${paidBookingIds.join(",")}`,
              { replace: true },
            );
          }, 900);
        }
        return;
      }

      if (TERMINAL_STATUSES.has(result.status)) return;
      attempts += 1;
      if (attempts < 15) timer = window.setTimeout(poll, 2000);
    }

    async function begin() {
      if (isCancelReturn && orderCode) {
        try {
          const current = await getPayOsOrder(orderCode);
          if (!TERMINAL_STATUSES.has(current.status)) {
            const cancelled = await cancelPayOsOrder(orderCode);
            if (active) setOrder(cancelled);
          } else if (active) {
            setOrder(current);
          }
        } catch {
          await poll();
        } finally {
          if (active) setLoading(false);
        }
        return;
      }
      await poll();
    }

    begin();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [bookingIds, hotelReturnContext, isCancelReturn, isHotelAdmin, loadOrder, navigate, orderCode]);

  const copy = statusCopy(order?.status);
  const StatusIcon = copy.icon;

  return (
    <main className="payment-gateway-page payos-return-page">
      <div className="container payment-gateway-shell payos-return-shell">
        <Link
          to={
            isHotelAdmin
              ? hotelReturnContext?.source === "CURRENT_STAYS"
                ? "/hotel-admin/current-stays"
                : `/hotel-admin/check-in?resume=1&orderCode=${encodeURIComponent(orderCode)}`
              : "/customer/bookings"
          }
          className="checkout-back-link"
        >
          <ArrowLeft size={18} />
          {isHotelAdmin
            ? hotelReturnContext?.source === "CURRENT_STAYS"
              ? "Quay lại khách đang lưu trú"
              : "Quay lại nhận phòng"
            : "Xem đơn đặt phòng"}
        </Link>

        <section className={`payos-status-card ${copy.tone}`}>
          <div className="payos-status-icon">
            <StatusIcon className={checking ? "spin" : ""} size={38} />
          </div>
          <div>
            <span>PAYOS · ENZIUROOMS</span>
            <h1>{loading ? "Đang tải giao dịch..." : copy.title}</h1>
            <p>{copy.message}</p>
          </div>
        </section>

        <ErrorMessage message={error} onRetry={() => void loadOrder({ sync: true })} />

        {order ? (
          <section className="payos-order-card">
            <div className="payos-order-heading">
              <div>
                <small>Mã giao dịch</small>
                <strong>{order.orderCode || "Chưa có mã giao dịch"}</strong>
              </div>
              <StatusBadge
                status={order.status}
                label={paymentStatusLabel(order.status)}
                className="payos-status-pill"
              />
            </div>

            <div className="payos-order-grid">
              <div>
                <small>Số tiền</small>
                <strong>{money(order.amount)}</strong>
              </div>
              <div>
                <small>Hình thức</small>
                <strong>
                  {paymentTypeLabel(order.paymentType)}
                </strong>
              </div>
              <div>
                <small>Nhà cung cấp</small>
                <strong>PayOS / VietQR</strong>
              </div>
              <div>
                <small>Tham chiếu ngân hàng</small>
                <strong>{order.providerReference || "Chưa được PayOS cung cấp"}</strong>
              </div>
            </div>

            {order.failureReason ? (
              <div className="payos-failure-reason">{order.failureReason}</div>
            ) : null}

            <div className="payos-return-actions">
              {!TERMINAL_STATUSES.has(order.status) ? (
                <button type="button" onClick={() => loadOrder({ sync: true })} disabled={checking}>
                  <RefreshCw className={checking ? "spin" : ""} size={18} />
                  {checking ? "Đang kiểm tra..." : "Kiểm tra lại với PayOS"}
                </button>
              ) : null}

              {order.checkoutUrl && !TERMINAL_STATUSES.has(order.status) ? (
                <a href={order.checkoutUrl}>
                  <ExternalLink size={18} /> Quay lại trang thanh toán
                </a>
              ) : null}

              <Link
                to={
                  isHotelAdmin
                    ? `/hotel-admin/check-in?resume=1&orderCode=${encodeURIComponent(orderCode)}`
                    : "/customer/bookings"
                }
              >
                {isHotelAdmin
                  ? hotelReturnContext?.source === "CURRENT_STAYS"
                    ? "Quay lại khách đang lưu trú"
                    : "Quay lại quầy check-in"
                  : "Xem lịch sử booking"}
              </Link>
            </div>
          </section>
        ) : null}

        <div className="payment-security-note payos-security-note">
          <ShieldCheck size={20} />
          Thanh toán sẽ được xác nhận tự động. Nếu trạng thái chưa cập nhật, vui lòng chờ vài giây rồi thử lại.
        </div>
      </div>
    </main>
  );
}
