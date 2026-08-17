import {
  BadgeCheck,
  BedDouble,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileImage,
  Hotel,
  LoaderCircle,
  MapPin,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Square,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import {
  completeBookingCheckIn,
  verifyCheckInCode,
} from "../../services/bookingService";
import {
  collectCashAtHotel,
  createCheckInPayOsCheckout,
  syncPayOsOrder,
} from "../../services/paymentService";
import {
  decodeQrImageFile,
  getQrText,
  loadZxingBrowser,
} from "../../utils/qrReader";
import "./CheckInPage.css";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

function paymentOptionLabel(value, depositPercent) {
  if (value === "PAY_AT_HOTEL") return "Thanh toán tại khách sạn";
  if (value === "DEPOSIT") return `Đặt cọc ${depositPercent ?? 30}%`;
  if (value === "FULL_PAYMENT") return "Thanh toán toàn bộ";
  return value;
}

const CHECKIN_PAYMENT_CONTEXT_KEY = "enziuroomsHotelCheckInPayment";
const CHECKIN_PAYMENT_CHANNEL = "enziurooms-payos-checkin";
const CHECKIN_CONTEXT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function readCheckInPaymentContext() {
  try {
    const raw = localStorage.getItem(CHECKIN_PAYMENT_CONTEXT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.bookingId) return null;

    const createdAt = Number(parsed.createdAt ?? 0);
    if (!createdAt || Date.now() - createdAt > CHECKIN_CONTEXT_MAX_AGE_MS) {
      localStorage.removeItem(CHECKIN_PAYMENT_CONTEXT_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveCheckInPaymentContext(value) {
  try {
    localStorage.setItem(
      CHECKIN_PAYMENT_CONTEXT_KEY,
      JSON.stringify({ ...value, createdAt: value.createdAt ?? Date.now() }),
    );
  } catch {
    // localStorage có thể bị chặn; check-in vẫn hoạt động trong tab hiện tại.
  }
}

function clearCheckInPaymentContext() {
  try {
    localStorage.removeItem(CHECKIN_PAYMENT_CONTEXT_KEY);
  } catch {
    // Best effort.
  }
}

export default function CheckInPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const videoRef = useRef(null);
  const qrControlsRef = useRef(null);
  const qrLibraryRef = useRef(null);
  const lastDetectedRef = useRef("");

  const stopCamera = useCallback(() => {
    try {
      qrControlsRef.current?.stop?.();
    } catch {
      // The stream may already have stopped after a successful scan.
    }
    qrControlsRef.current = null;

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks?.().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    try {
      qrLibraryRef.current?.BrowserCodeReader?.releaseAllStreams?.();
    } catch {
      // Cleanup is best-effort across browsers.
    }

    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const verify = useCallback(async (rawCode, { silent = false } = {}) => {
    const normalized = String(rawCode ?? "").trim();
    if (!normalized) {
      if (!silent) setError("Vui lòng quét hoặc nhập mã QR check-in.");
      return null;
    }

    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await verifyCheckInCode(normalized);
      setCode(normalized);
      setResult(data);
      return data;
    } catch (requestError) {
      if (!silent) {
        setResult(null);
        setError(
          requestError.response?.data?.message
            ?? requestError.response?.data?.detail
            ?? "Không thể xác minh mã QR check-in.",
        );
      }
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const context = readCheckInPaymentContext();
    const shouldResume = searchParams.get("resume") === "1";

    if (!context || (!shouldResume && !context.pending)) {
      return;
    }

    let active = true;

    setCode(context.code);
    if (context.orderCode) {
      setPaymentOrder({
        orderCode: context.orderCode,
        amount: context.amount,
        checkoutUrl: context.checkoutUrl,
        status: context.status ?? "PENDING",
      });
    }

    void verify(context.code, { silent: true }).then((data) => {
      if (!active || !data) return;

      if (data.paymentComplete) {
        setPaymentOrder(null);
        clearCheckInPaymentContext();
        setMessage(
          "Thanh toán PayOS đã hoàn tất. Booking được khôi phục tự động, không cần quét lại QR.",
        );
      } else if (context.paidAt) {
        setMessage("Đang cập nhật giao dịch PayOS...");
      }

      if (shouldResume) {
        const next = new URLSearchParams(searchParams);
        next.delete("resume");
        next.delete("orderCode");
        setSearchParams(next, { replace: true });
      }
    });

    return () => {
      active = false;
    };
    // Chỉ khôi phục một lần khi trang check-in được mở/return từ PayOS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;

    const channel = new BroadcastChannel(CHECKIN_PAYMENT_CHANNEL);

    channel.onmessage = (event) => {
      const payload = event?.data;
      if (payload?.type !== "CHECKIN_PAYMENT_PAID") return;

      const context = readCheckInPaymentContext();
      const currentBookingId = result?.booking?.id;
      const eventBookingId = payload.bookingId ?? context?.bookingId;

      if (currentBookingId && eventBookingId && currentBookingId !== eventBookingId) {
        return;
      }

      const restoreCode = code || context?.code;
      if (!restoreCode) return;

      void verify(restoreCode, { silent: true }).then((data) => {
        if (!data) return;

        if (data.paymentComplete) {
          setPaymentOrder(null);
          clearCheckInPaymentContext();
          setMessage(
            "PayOS đã xác nhận thanh toán đủ. Booking được cập nhật tự động và có thể nhận phòng ngay.",
          );
        } else {
          setMessage("Đã nhận xác nhận PayOS, đang hoàn tất đối soát booking...");
        }
      });
    };

    return () => channel.close();
  }, [code, result?.booking?.id, verify]);

  useEffect(() => {
    if (!paymentOrder || !code || result?.paymentComplete) return undefined;

    let active = true;
    let running = false;

    async function reconcilePayOs() {
      if (!active || running) return;
      running = true;

      try {
        // Không chỉ chờ webhook. Hotel Admin chủ động hỏi PayOS để đối soát
        // giao dịch phần còn lại. Cách này hoạt động cả khi localhost không có
        // public webhook URL. Backend vẫn là nơi xác minh trạng thái thật.
        const syncedOrder = await syncPayOsOrder(paymentOrder.orderCode);
        if (!active) return;

        if (syncedOrder?.status === "PAID") {
          const data = await verify(code, { silent: true });
          if (!active) return;

          if (data?.paymentComplete) {
            setPaymentOrder(null);
            clearCheckInPaymentContext();
            setMessage(
              "PayOS đã xác nhận khách thanh toán đủ. Số tiền còn lại là 0 ₫ và có thể nhận phòng.",
            );
          }
          return;
        }

        // Vẫn refresh booking để nhận thay đổi nếu webhook đã xử lý trước.
        const data = await verify(code, { silent: true });
        if (active && data?.paymentComplete) {
          setPaymentOrder(null);
          clearCheckInPaymentContext();
          setMessage("PayOS đã xác nhận khách thanh toán đủ. Có thể nhận phòng.");
        }
      } catch (requestError) {
        // Polling là best-effort. Không làm mất màn hình check-in chỉ vì một
        // lần gọi PayOS bị timeout; lần kế tiếp sẽ tự thử lại.
        console.warn("EnziuRooms PayOS check-in reconciliation:", requestError);
      } finally {
        running = false;
      }
    }

    void reconcilePayOs();
    const timer = window.setInterval(reconcilePayOs, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, paymentOrder, result?.paymentComplete, verify]);

  async function startCamera() {
    setError("");
    setMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Thiết bị hoặc trình duyệt không hỗ trợ truy cập camera.");
      return;
    }

    stopCamera();
    setCameraActive(true);
    setLoading(true);

    try {
      const qrLibrary = await loadZxingBrowser();
      qrLibraryRef.current = qrLibrary;

      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (!videoRef.current) {
        throw new Error("Không khởi tạo được vùng hiển thị camera.");
      }

      const reader = new qrLibrary.BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        videoRef.current,
        (scanResult, _scanError, callbackControls) => {
          const rawValue = getQrText(scanResult);
          if (!rawValue || rawValue === lastDetectedRef.current) return;

          lastDetectedRef.current = rawValue;
          callbackControls?.stop?.();
          qrControlsRef.current = null;
          setCameraActive(false);
          void verify(rawValue);
        },
      );

      qrControlsRef.current = controls;
    } catch (cameraError) {
      stopCamera();
      setError(
        cameraError?.name === "NotAllowedError"
          ? "Bạn chưa cho phép trình duyệt sử dụng camera."
          : cameraError?.message
            ?? "Không thể mở camera để quét QR.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleQrImage(event) {
    const file = event.target.files?.[0];

    // Reset để người dùng có thể chọn lại cùng một ảnh nếu cần.
    event.target.value = "";

    if (!file) return;

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const rawValue = await decodeQrImageFile(file);

      if (!rawValue) {
        throw new Error("Không tìm thấy nội dung trong mã QR.");
      }

      setCode(rawValue);

      const data = await verify(rawValue, { silent: true });

      if (!data) {
        throw new Error(
          "Đã đọc được QR nhưng mã check-in không hợp lệ hoặc booking không tồn tại.",
        );
      }

      setMessage("Đã đọc mã QR và xác minh booking thành công.");
    } catch (scanError) {
      setResult(null);

      console.error("EnziuRooms QR image scan error:", scanError);

      const technicalMessage = String(scanError?.message ?? "");

      if (technicalMessage.includes("Dimensions could be not found")) {
        setError(
          "Không thể đọc kích thước ảnh QR. Hãy thử chụp lại mã QR rõ hơn.",
        );
      } else {
        setError(
          technicalMessage
            || "Không thể đọc mã QR từ ảnh. Hãy chọn ảnh rõ và không cắt mất mã QR.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePayOs() {
    if (!result?.booking?.id) return;
    setWorking("PAYOS");
    setError("");
    setMessage("");
    try {
      const order = await createCheckInPayOsCheckout(result.booking.id);
      setPaymentOrder(order);

      saveCheckInPaymentContext({
        code,
        bookingId: result.booking.id,
        bookingCode: result.booking.bookingCode,
        orderCode: order.orderCode,
        amount: order.amount,
        checkoutUrl: order.checkoutUrl,
        status: order.status ?? "PENDING",
        pending: true,
        createdAt: Date.now(),
      });

      if (order.checkoutUrl) {
        window.open(order.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(
        "Đã mở PayOS ở tab mới. Sau khi thanh toán, màn hình này sẽ tự cập nhật; không cần quét lại QR.",
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tạo giao dịch PayOS tại quầy.",
      );
    } finally {
      setWorking("");
    }
  }

  async function handleCollectAtHotel() {
    if (!result?.booking?.id) return;
    if (!window.confirm(
      `Xác nhận đã thu đủ ${money(result.booking.remainingAmount)} tại khách sạn?`,
    )) return;

    setWorking("COLLECT");
    setError("");
    setMessage("");
    try {
      await collectCashAtHotel(result.booking.id);
      const refreshed = await verifyCheckInCode(code);
      setResult(refreshed);
      setMessage("Đã ghi nhận tiền mặt và cập nhật doanh thu khách sạn.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể ghi nhận thanh toán tại quầy.",
      );
    } finally {
      setWorking("");
    }
  }

  async function handleCheckIn() {
    if (!result?.booking?.id) return;
    setWorking("CHECK_IN");
    setError("");
    setMessage("");
    try {
      const data = await completeBookingCheckIn(result.booking.id, code);
      setResult(data);
      setPaymentOrder(null);
      clearCheckInPaymentContext();
      setMessage("Xác nhận nhận phòng thành công. Phòng đã được chuyển sang trạng thái đang sử dụng.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể xác nhận nhận phòng.",
      );
    } finally {
      setWorking("");
    }
  }

  const booking = result?.booking;
  const isDone = booking?.status === "CHECKED_IN";
  const hasRemaining = Number(booking?.remainingAmount ?? 0) > 0;

  return (
    <main className="hotel-checkin-page">
      <div className="hotel-checkin-heading">
        <span>VẬN HÀNH LƯU TRÚ</span>
        <h1>Nhận phòng bằng QR</h1>
        <p>
          Quét mã của khách, kiểm tra thanh toán và xác nhận check-in ngay tại quầy.
        </p>
      </div>

      <ErrorMessage message={error} />
      {message ? <div className="checkin-success-message"><CheckCircle2 size={19} />{message}</div> : null}

      <section className="checkin-scanner-card">
        <div className="checkin-scanner-copy">
          <span><ScanLine size={22} /></span>
          <div>
            <h2>Quét mã của khách</h2>
            <p>Cho phép camera, tải ảnh QR hoặc dán mã check-in thủ công.</p>
          </div>
        </div>

        <div className="checkin-input-row">
          <div>
            <QrCode size={19} />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="ENZIU-CHECKIN:..."
              onKeyDown={(event) => {
                if (event.key === "Enter") void verify(code);
              }}
            />
          </div>
          <button type="button" onClick={() => void verify(code)} disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <BadgeCheck size={18} />}
            Xác minh
          </button>
        </div>

        <div className="checkin-scan-actions">
          <button type="button" onClick={cameraActive ? stopCamera : startCamera}>
            {cameraActive ? <Square size={18} /> : <Camera size={18} />}
            {cameraActive ? "Dừng camera" : "Mở camera"}
          </button>
          <label>
            <FileImage size={18} />
            Đọc QR từ ảnh
            <input type="file" accept="image/*" onChange={handleQrImage} />
          </label>
        </div>

        {cameraActive ? (
          <div className="checkin-camera-frame">
            <video ref={videoRef} muted playsInline />
            <div className="checkin-camera-guide"><span /></div>
          </div>
        ) : null}
      </section>

      {result ? (
        <section className={`checkin-result-card ${result.canCheckIn ? "ready" : "attention"}`}>
          <div className="checkin-result-header">
            <div className="checkin-result-icon">
              {isDone ? <CheckCircle2 size={30} /> : result.canCheckIn ? <BadgeCheck size={30} /> : <ShieldAlert size={30} />}
            </div>
            <div>
              <span>BOOKING ĐÃ XÁC MINH</span>
              <h2>{booking.bookingCode}</h2>
              <p>{result.actionMessage}</p>
            </div>
            <button type="button" onClick={() => void verify(code)}>
              <RefreshCw size={17} /> Kiểm tra lại
            </button>
          </div>

          <div className="checkin-result-grid">
            <div className="checkin-guest-card">
              <h3><UserRound size={19} /> Thông tin khách</h3>
              <strong>{booking.guestLastName} {booking.guestFirstName}</strong>
              <span>{booking.guestPhone || booking.bookerPhone}</span>
              <span>{booking.bookerEmail}</span>
              <div>
                <Users size={17} />
                {booking.adults} người lớn · {booking.children} trẻ em
              </div>
            </div>

            <div className="checkin-stay-card">
              <h3><Hotel size={19} /> Thông tin lưu trú</h3>
              <strong>{result.hotelName}</strong>
              <span><MapPin size={15} /> {result.hotelAddress}</span>
              <div className="checkin-stay-room">
                <BedDouble size={18} />
                <div>
                  <small>{result.roomTypeName}</small>
                  <strong>Phòng {result.roomNumber}</strong>
                </div>
              </div>
              <div className="checkin-date-row">
                <span>
                  <small>Nhận phòng</small>
                  <strong>{formatDate(booking.checkIn)}</strong>
                  <em>Từ {formatDateTime(result.expectedCheckInAt).split(" ").slice(-1)[0]}</em>
                </span>
                <span>
                  <small>Trả phòng</small>
                  <strong>{formatDate(booking.checkOut)}</strong>
                  <em>Trước {formatDateTime(result.expectedCheckOutAt).split(" ").slice(-1)[0]}</em>
                </span>
              </div>
              {isDone ? (
                <div className="checkin-checkout-deadline">
                  <Clock3 size={17} />
                  <div>
                    <small>Khách cần trả phòng trước</small>
                    <strong>{formatDateTime(result.expectedCheckOutAt)}</strong>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="checkin-payment-card">
              <h3><WalletCards size={19} /> Thanh toán</h3>
              <div><span>Hình thức</span><strong>{paymentOptionLabel(booking.paymentOption, booking.depositPercent)}</strong></div>
              <div><span>Tổng booking</span><strong>{money(booking.totalPrice)}</strong></div>
              <div><span>Đã thanh toán</span><strong className="paid">{money(booking.paidAmount)}</strong></div>
              <div><span>Còn phải thu</span><strong className="remaining">{money(booking.remainingAmount)}</strong></div>
            </div>
          </div>

          {paymentOrder ? (
            <div className="checkin-payos-order">
              <div>
                <CreditCard size={20} />
                <span>
                  <strong>Đang chờ PayOS xác nhận</strong>
                  <small>Mã giao dịch {paymentOrder.orderCode} · {money(paymentOrder.amount)}</small>
                </span>
              </div>
              {paymentOrder.checkoutUrl ? (
                <a href={paymentOrder.checkoutUrl} target="_blank" rel="noreferrer">
                  Mở lại trang QR PayOS
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="checkin-action-bar">
            {hasRemaining && !isDone ? (
              <>
                <button
                  type="button"
                  className="checkin-payos-button"
                  onClick={handlePayOs}
                  disabled={Boolean(working)}
                >
                  <CreditCard size={18} />
                  {working === "PAYOS" ? "Đang tạo QR..." : `Thu qua PayOS ${money(booking.remainingAmount)}`}
                </button>
                <button
                  type="button"
                  className="checkin-cash-button"
                  onClick={handleCollectAtHotel}
                  disabled={Boolean(working)}
                >
                  <CircleDollarSign size={18} />
                  {working === "COLLECT" ? "Đang ghi nhận..." : "Đã thu tại quầy"}
                </button>
              </>
            ) : null}

            {!isDone ? (
              <button
                type="button"
                className="checkin-complete-button"
                onClick={handleCheckIn}
                disabled={!result.canCheckIn || Boolean(working)}
                title={!result.canCheckIn ? result.actionMessage : "Xác nhận khách nhận phòng"}
              >
                <CheckCircle2 size={19} />
                {working === "CHECK_IN" ? "Đang check-in..." : "Xác nhận nhận phòng"}
              </button>
            ) : (
              <div className="checkin-completed-badge">
                <CheckCircle2 size={20} /> Khách đã nhận phòng
              </div>
            )}
          </div>

          {!result.paymentComplete && !isDone ? (
            <div className="checkin-warning-note">
              <Clock3 size={18} />
              <span>
                Nút nhận phòng sẽ được mở sau khi số tiền còn lại bằng 0 ₫.
                Nếu thu tiền mặt tại quầy, hoa hồng sẽ được khấu trừ từ Ví đối tác
                và ghi nhận doanh thu tiền mặt để không bỏ sót doanh thu/hoa hồng.
              </span>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}