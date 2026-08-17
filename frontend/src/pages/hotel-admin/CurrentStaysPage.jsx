import {
  Banknote,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  DoorOpen,
  Hotel,
  LogOut,
  MapPin,
  RefreshCw,
  TimerReset,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  assessLateCheckoutFee,
  checkOutBooking,
  getCurrentHotelStays,
} from "../../services/bookingService";
import {
  collectCashAtHotel,
  createCheckInPayOsCheckout,
  syncPayOsOrder,
} from "../../services/paymentService";
import "./CurrentStaysPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const HOTEL_PAYMENT_RETURN_KEY = "enziuroomsHotelPaymentReturn";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatOverdueMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes ?? 0));
  const days = Math.floor(safeMinutes / 1440);
  const hours = Math.floor((safeMinutes % 1440) / 60);
  const mins = safeMinutes % 60;
  return [
    days ? `${days} ngày` : "",
    hours ? `${hours} giờ` : "",
    mins ? `${mins} phút` : "",
  ].filter(Boolean).join(" ") || "dưới 1 phút";
}

function checkoutLabel(expectedCheckOutAt, now) {
  if (!expectedCheckOutAt) {
    return { tone: "normal", label: "Chưa có giờ trả phòng" };
  }

  const target = new Date(expectedCheckOutAt).getTime();
  const diff = target - now;
  const absoluteMinutes = Math.max(0, Math.round(Math.abs(diff) / 60_000));
  const duration = formatOverdueMinutes(absoluteMinutes);

  if (diff < 0) {
    return { tone: "overdue", label: `Quá giờ trả phòng ${duration}` };
  }

  if (diff <= 2 * 60 * 60 * 1000) {
    return { tone: "soon", label: `Còn ${duration} đến giờ trả phòng` };
  }

  return { tone: "normal", label: `Còn ${duration}` };
}

function readPaymentReturnContext() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOTEL_PAYMENT_RETURN_KEY) ?? "null");
    if (!parsed || parsed.source !== "CURRENT_STAYS") return null;
    if (!parsed.bookingId || !parsed.orderCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePaymentReturnContext(value) {
  try {
    localStorage.setItem(
      HOTEL_PAYMENT_RETURN_KEY,
      JSON.stringify({ ...value, createdAt: Date.now() }),
    );
  } catch {
    // Best effort. Polling in the current tab still works.
  }
}

function clearPaymentReturnContext(orderCode) {
  try {
    const current = readPaymentReturnContext();
    if (!current || !orderCode || String(current.orderCode) === String(orderCode)) {
      localStorage.removeItem(HOTEL_PAYMENT_RETURN_KEY);
    }
  } catch {
    // Best effort.
  }
}


function resolveGuestName(booking) {
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

  return booking?.guestEmail || booking?.bookerEmail || "Khách chưa cập nhật tên";
}

function replaceStay(setStays, updated) {
  if (!updated?.booking?.id) return;
  setStays((current) => current.map((stay) => (
    stay.booking?.id === updated.booking.id ? updated : stay
  )));
}

export default function CurrentStaysPage() {
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [paymentOrders, setPaymentOrders] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);

  const loadStays = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await getCurrentHotelStays();
      setStays(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải danh sách khách đang lưu trú.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStays();
  }, [loadStays]);

  useRealtimeRefresh(
    ["NOTIFICATION_CREATED", "AVAILABILITY_CHANGED"],
    () => loadStays({ silent: true }),
    { debounceMs: 120 },
  );

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadStays({ silent: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadStays]);

  useEffect(() => {
    const context = readPaymentReturnContext();
    if (!context) return;
    setPaymentOrders((current) => ({
      ...current,
      [context.bookingId]: {
        orderCode: context.orderCode,
        amount: context.amount,
        status: context.status ?? "PENDING",
        checkoutUrl: context.checkoutUrl,
      },
    }));
  }, []);

  useEffect(() => {
    const pendingEntries = Object.entries(paymentOrders).filter(([, order]) =>
      order?.orderCode && !["PAID", "CANCELLED", "EXPIRED", "FAILED", "REFUNDED"].includes(order.status),
    );
    if (pendingEntries.length === 0) return undefined;

    let active = true;
    let syncing = false;

    async function syncPending() {
      if (!active || syncing) return;
      syncing = true;
      try {
        for (const [bookingId, order] of pendingEntries) {
          try {
            const synced = await syncPayOsOrder(order.orderCode);
            if (!active) return;
            setPaymentOrders((current) => ({
              ...current,
              [bookingId]: synced,
            }));

            if (synced.status === "PAID") {
              clearPaymentReturnContext(synced.orderCode);
              await loadStays({ silent: true });
              setMessage(
                `PayOS đã xác nhận ${money(synced.amount)}. Số tiền còn lại của booking đã được cập nhật tự động.`,
              );
            }
          } catch {
            // Giữ polling. PayOS có thể cần vài giây để đồng bộ sau khi ngân hàng trừ tiền.
          }
        }
      } finally {
        syncing = false;
      }
    }

    void syncPending();
    const timer = window.setInterval(syncPending, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paymentOrders, loadStays]);

  const summary = useMemo(() => {
    const overdue = stays.filter((item) => {
      if (!item.expectedCheckOutAt) return false;
      return new Date(item.expectedCheckOutAt).getTime() < now;
    }).length;

    const dueSoon = stays.filter((item) => {
      if (!item.expectedCheckOutAt) return false;
      const diff = new Date(item.expectedCheckOutAt).getTime() - now;
      return diff >= 0 && diff <= 2 * 60 * 60 * 1000;
    }).length;

    return { total: stays.length, dueSoon, overdue };
  }, [stays, now]);

  async function handleAssessLateFee(item, { announce = true } = {}) {
    const booking = item.booking;
    if (!booking?.id) return null;

    setWorkingId(booking.id);
    setError("");
    if (announce) setMessage("");
    try {
      const updated = await assessLateCheckoutFee(booking.id);
      replaceStay(setStays, updated);

      const fee = Number(updated.booking?.lateCheckoutFee ?? 0);
      const expectedFee = Number(updated.lateCheckout?.estimatedFee ?? 0);

      // Không cho tiếp tục thu tiền nếu backend vẫn đang chạy image cũ:
      // UI có thể tính được 60.000đ nhưng Booking DB vẫn chỉ giữ 20.000đ.
      if (expectedFee - fee > 0.01) {
        console.warn("[late-fee-sync] Phụ thu chưa đồng bộ", { expectedFee, persistedFee: fee });
        setError("Phụ thu chưa được cập nhật. Vui lòng thử lại sau ít phút.");
        return null;
      }

      if (announce) {
        if (fee > 0) {
          setMessage(
            `Đã cập nhật phụ thu trả phòng trễ: ${money(fee)}.`,
          );
        } else {
          setMessage("Khách đang trong thời gian miễn phí trả trễ, chưa phát sinh phụ thu.");
        }
      }
      return updated;
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể cập nhật phụ thu trả phòng trễ.",
      );
      return null;
    } finally {
      setWorkingId("");
    }
  }

  async function handleCollectCash(item) {
    let currentItem = item;
    let booking = currentItem.booking;
    if (!booking?.id) return;

    if (currentItem.lateCheckout?.overdue) {
      const refreshed = await handleAssessLateFee(currentItem, { announce: false });
      if (!refreshed) return;
      currentItem = refreshed;
      booking = refreshed.booking;
    }

    if (Number(booking.remainingAmount ?? 0) <= 0) return;
    if (!window.confirm(`Xác nhận đã thu ${money(booking.remainingAmount)} tại quầy?`)) return;

    setWorkingId(booking.id);
    setError("");
    setMessage("");
    try {
      await collectCashAtHotel(booking.id);
      await loadStays({ silent: true });
      setMessage(`Đã ghi nhận thu tại quầy ${money(booking.remainingAmount)}.`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể ghi nhận khoản thu tại quầy.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function handlePayOs(item) {
    let currentItem = item;
    let booking = currentItem.booking;
    if (!booking?.id) return;

    if (currentItem.lateCheckout?.overdue) {
      const refreshed = await handleAssessLateFee(currentItem, { announce: false });
      if (!refreshed) return;
      currentItem = refreshed;
      booking = refreshed.booking;
    }

    if (Number(booking.remainingAmount ?? 0) <= 0) return;

    setWorkingId(booking.id);
    setError("");
    setMessage("");
    try {
      const order = await createCheckInPayOsCheckout(booking.id);
      setPaymentOrders((current) => ({ ...current, [booking.id]: order }));
      savePaymentReturnContext({
        source: "CURRENT_STAYS",
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        orderCode: order.orderCode,
        amount: order.amount,
        checkoutUrl: order.checkoutUrl,
        status: order.status ?? "PENDING",
      });

      if (!order.checkoutUrl) {
        throw new Error("PayOS không trả về đường dẫn thanh toán.");
      }

      const paymentWindow = window.open(order.checkoutUrl, "_blank", "noopener,noreferrer");
      if (!paymentWindow) {
        window.location.assign(order.checkoutUrl);
      } else {
        setMessage(
          `Đã mở QR PayOS ${money(order.amount)} ở tab mới. Trang này sẽ tự cập nhật khi PayOS xác nhận.`,
        );
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.message
          ?? "Không thể tạo giao dịch PayOS.",
      );
    } finally {
      setWorkingId("");
    }
  }

  async function handleCheckout(item) {
    let currentItem = item;
    let booking = currentItem.booking;
    if (!booking?.id) return;

    const late = currentItem.lateCheckout;
    if (late?.overdue) {
      const updated = await handleAssessLateFee(currentItem, { announce: false });
      if (!updated) return;
      currentItem = updated;
      booking = updated.booking;
    }

    if (Number(booking.remainingAmount ?? 0) > 0) {
      setError(
        `Booking còn phải thu ${money(booking.remainingAmount)}. Vui lòng thu đủ tiền trước khi xác nhận trả phòng.`,
      );
      return;
    }

    const deadline = currentItem.expectedCheckOutAt
      ? new Date(currentItem.expectedCheckOutAt).getTime()
      : null;
    const isEarly = deadline != null && now > 0 && now < deadline;

    const confirmation = isEarly
      ? `Booking ${booking.bookingCode} chưa tới giờ trả phòng.\n\nBạn vẫn muốn xác nhận khách trả phòng sớm?`
      : `Xác nhận khách đã trả phòng ${currentItem.roomNumber}?`;

    if (!window.confirm(confirmation)) return;

    setWorkingId(booking.id);
    setError("");
    setMessage("");

    try {
      const updated = await checkOutBooking(booking.id);
      setStays((current) => current.filter((stay) => stay.booking.id !== booking.id));
      setMessage(
        `Đã trả phòng ${updated.roomNumber}. Phòng được chuyển sang trạng thái Đang dọn phòng.`,
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể xác nhận trả phòng.",
      );
    } finally {
      setWorkingId("");
    }
  }

  if (loading) {
    return <Loading message="Đang tải khách lưu trú..." />;
  }

  return (
    <main className="current-stays-page">
      <section className="current-stays-heading">
        <div>
          <span>VẬN HÀNH LƯU TRÚ</span>
          <h1>Khách đang lưu trú</h1>
          <p>
            Theo dõi khách đã check-in, giờ trả phòng, phụ thu trả trễ và xác nhận checkout tại quầy.
          </p>
        </div>
        <button type="button" onClick={() => void loadStays()}>
          <RefreshCw size={18} /> Làm mới
        </button>
      </section>

      <section className="current-stays-summary">
        <article>
          <span><BedDouble size={21} /></span>
          <div><small>Đang lưu trú</small><strong>{summary.total}</strong></div>
        </article>
        <article>
          <span><CalendarClock size={21} /></span>
          <div><small>Trả trong 2 giờ</small><strong>{summary.dueSoon}</strong></div>
        </article>
        <article className={summary.overdue ? "danger" : ""}>
          <span><TimerReset size={21} /></span>
          <div><small>Đã quá giờ</small><strong>{summary.overdue}</strong></div>
        </article>
      </section>

      <ErrorMessage message={error} />
      {message ? (
        <div className="current-stays-success">
          <CheckCircle2 size={19} /> {message}
        </div>
      ) : null}

      {stays.length === 0 ? (
        <section className="current-stays-empty">
          <DoorOpen size={48} />
          <h2>Chưa có khách đang lưu trú</h2>
          <p>Booking sẽ xuất hiện ở đây sau khi khách được xác nhận nhận phòng.</p>
        </section>
      ) : (
        <section className="current-stays-list">
          {stays.map((item) => {
            const booking = item.booking;
            const checkout = checkoutLabel(item.expectedCheckOutAt, now);
            const late = item.lateCheckout;
            const paymentOrder = paymentOrders[booking.id];
            const persistedRemaining = Number(booking.remainingAmount ?? 0);
            const feeAssessed = Boolean(late?.feeAssessed || booking.lateFeeAssessedAt);
            const estimatedLateFee = Number(late?.estimatedFee ?? 0);
            const assessedLateFee = Number(booking.lateCheckoutFee ?? late?.assessedFee ?? 0);
            const lateFeeDelta = Math.max(0, estimatedLateFee - assessedLateFee);
            const currentLateFee = Math.max(assessedLateFee, estimatedLateFee);
            const remaining = persistedRemaining + lateFeeDelta;
            const effectiveTotal = Number(booking.totalPrice ?? 0) + lateFeeDelta;
            const backendLateFeeOutOfSync = lateFeeDelta > 0.01;
            const guestName = resolveGuestName(booking);

            return (
              <article key={booking.id} className={`current-stay-card ${checkout.tone}`}>
                <div className="current-stay-top">
                  <div>
                    <span className="current-stay-code">{booking.bookingCode}</span>
                    <h2>{guestName}</h2>
                    <p><Hotel size={15} /> {item.hotelName} · Phòng {item.roomNumber}</p>
                    <p><MapPin size={15} /> {item.hotelAddress}</p>
                  </div>
                  <span className={`current-stay-deadline ${checkout.tone}`}>
                    <Clock3 size={16} /> {checkout.label}
                  </span>
                </div>

                <div className="current-stay-grid">
                  <div className="current-stay-info">
                    <h3><UserRound size={18} /> Liên hệ khách</h3>
                    <strong>{guestName}</strong>
                    <span>{booking.guestPhone || booking.bookerPhone || "Chưa có số điện thoại"}</span>
                    <span><Users size={15} /> {booking.adults} người lớn · {booking.children} trẻ em</span>
                  </div>

                  <div className="current-stay-info">
                    <h3><Hotel size={18} /> Phòng đang ở</h3>
                    <strong>{item.roomTypeName}</strong>
                    <span>Phòng {item.roomNumber}</span>
                    <span>Đã nhận phòng: {formatDateTime(item.actualCheckInAt)}</span>
                  </div>

                  <div className="current-stay-info important">
                    <h3><CalendarClock size={18} /> Lịch trả phòng</h3>
                    <strong>{formatDateTime(item.expectedCheckOutAt)}</strong>
                    <span>Trả phòng trước thời điểm trên</span>
                    <span className={checkout.tone}>{checkout.label}</span>
                  </div>

                  <div className="current-stay-info current-stay-payment-box">
                    <h3><WalletCards size={18} /> Tiền phòng</h3>
                    <strong>{money(effectiveTotal)}</strong>
                    {Number(booking.weekendSurchargeAmount ?? 0) > 0 ? (
                      <span>Cuối tuần: +{money(booking.weekendSurchargeAmount)}</span>
                    ) : null}
                    {Number(booking.specialDateSurchargeAmount ?? 0) > 0 ? (
                      <span>Ngày đặc biệt: +{money(booking.specialDateSurchargeAmount)}</span>
                    ) : null}
                    {currentLateFee > 0 ? (
                      <span className="late-fee-line">Trả trễ hiện tại: +{money(currentLateFee)}</span>
                    ) : null}
                    <span>Đã thu: {money(booking.paidAmount)}</span>
                    <span className={remaining > 0 ? "remaining-due" : "remaining-paid"}>
                      Còn lại: {money(remaining)}
                    </span>
                    {backendLateFeeOutOfSync ? (
                      <span className="remaining-due">
                        Đang cập nhật +{money(lateFeeDelta)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {late?.overdue ? (
                  <div className={`late-checkout-panel ${currentLateFee > 0 ? "locked" : "preview"}`}>
                    <div className="late-checkout-panel-icon">
                      <TimerReset size={21} />
                    </div>
                    <div className="late-checkout-panel-copy">
                      <strong>Phụ thu trả trễ đang được tính</strong>
                      <span>{late.policyLabel}</span>
                      <small>
                        Quá giờ {formatOverdueMinutes(late.overdueMinutes)} · Miễn phí {late.graceMinutes ?? 60} phút đầu
                      </small>
                      {currentLateFee > 0 ? (
                        <small>Phí tiếp tục tăng theo mốc thời gian cho đến khi checkout.</small>
                      ) : null}
                    </div>
                    <div className="late-checkout-panel-amount">
                      <small>Phụ thu hiện tại</small>
                      <strong>{money(currentLateFee)}</strong>
                      {feeAssessed && booking.lateFeeAssessedAt ? (
                        <em>Cập nhật mức phí lúc {formatDateTime(booking.lateFeeAssessedAt)}</em>
                      ) : null}
                    </div>
                    {estimatedLateFee > 0 ? (
                      <button
                        type="button"
                        onClick={() => void handleAssessLateFee(item)}
                        disabled={workingId === booking.id}
                      >
                        <RefreshCw size={17} /> Cập nhật phụ thu
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {remaining > 0 ? (
                  <div className="current-stay-collection-panel">
                    <div>
                      <strong>Cần thu thêm {money(remaining)} trước khi checkout</strong>
                      <span>
                        {paymentOrder?.status === "PENDING" || paymentOrder?.status === "PROCESSING"
                          ? `PayOS #${paymentOrder.orderCode} đang chờ xác nhận.`
                          : "Chọn PayOS hoặc xác nhận đã thu tại quầy."}
                      </span>
                    </div>
                    <div className="current-stay-collection-actions">
                      <button
                        type="button"
                        className="payos"
                        onClick={() => void handlePayOs(item)}
                        disabled={workingId === booking.id}
                      >
                        <CreditCard size={17} /> Thu qua PayOS {money(remaining)}
                      </button>
                      <button
                        type="button"
                        className="cash"
                        onClick={() => void handleCollectCash(item)}
                        disabled={workingId === booking.id}
                      >
                        <Banknote size={17} /> Đã thu tại quầy
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="current-stay-actions">
                  <div>
                    <span>Check-in dự kiến: {formatDateTime(item.expectedCheckInAt)}</span>
                    <span>Checkout dự kiến: {formatDateTime(item.expectedCheckOutAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCheckout(item)}
                    disabled={workingId === booking.id || remaining > 0}
                    title={remaining > 0 ? `Còn phải thu ${money(remaining)}` : ""}
                  >
                    <LogOut size={18} />
                    {workingId === booking.id ? "Đang xử lý..." : "Xác nhận trả phòng"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
