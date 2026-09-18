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
  ShieldCheck,
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
import { Link, useSearchParams } from "react-router-dom";
import { stayManagementUrl } from "./stayManagementNavigation";

import ErrorMessage from "../../components/common/ErrorMessage";
import {
  PageHeader,
  StatusBadge,
} from "../../components/ui";
import {
  completeBookingCheckIn,
  verifyCheckInCode,
  verifyCheckInIdentity,
  verifyCheckInIdentityManual,
} from "../../services/bookingService";
import {
  collectCashAtHotel,
  createCheckInPayOsCheckout,
  syncPayOsOrder,
} from "../../services/paymentService";
import {
  decodeQrImageFile,
  decodeQrVideoElement,
  getQrText,
  loadZxingBrowser,
} from "../../utils/qrReader";
import "./CheckInPage.css";

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} ₫` : "—";
}

function formatDate(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTimeFromDateTime(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function paymentOptionLabel(value, depositPercent) {
  if (value === "PAY_AT_HOTEL") return "Thanh toán tại khách sạn";
  if (value === "DEPOSIT") {
    return depositPercent == null ? "Đặt cọc" : `Đặt cọc ${depositPercent}%`;
  }
  if (value === "FULL_PAYMENT") return "Thanh toán toàn bộ";
  return "Chưa xác định";
}

function guestName(booking) {
  if (!booking) return "Chưa cập nhật tên khách";
  const guest = [booking.guestLastName, booking.guestFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const booker = [booking.bookerLastName, booking.bookerFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return guest || booker || booking.bookerEmail || "Chưa cập nhật tên khách";
}

function guestSummary(booking) {
  const parts = [];
  if (booking?.adults != null) parts.push(`${booking.adults} người lớn`);
  if (booking?.children != null) parts.push(`${booking.children} trẻ em`);
  return parts.length ? parts.join(" · ") : "Chưa cập nhật số khách";
}

function identityFailureLabel(reason) {
  if (reason === "DATE_OF_BIRTH_MISMATCH") {
    return "Ngày sinh trên CCCD không khớp với ngày sinh đã khai khi đặt phòng.";
  }
  if (reason === "UNDERAGE") {
    return "Người đại diện nhận phòng chưa đủ 18 tuổi.";
  }
  return "Thông tin CCCD chưa đáp ứng điều kiện nhận phòng.";
}

function identitySubjectLabel() {
  return "Người đứng tên đặt phòng";
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

export default function CheckInPage({ embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [identityLoading, setIdentityLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMode, setCameraMode] = useState("BOOKING");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [manualConfirmOpen, setManualConfirmOpen] = useState(false);

  const videoRef = useRef(null);
  const qrControlsRef = useRef(null);
  const qrLibraryRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const lastDetectedRef = useRef("");

  const stopCamera = useCallback(() => {
    try {
      qrControlsRef.current?.stop?.();
    } catch {
      // Stream có thể đã tự dừng sau khi quét thành công.
    }
    qrControlsRef.current = null;

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks?.().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks?.().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const verify = useCallback(async (rawCode, { silent = false } = {}) => {
    const normalized = String(rawCode ?? "").trim();
    if (!normalized) {
      if (!silent) setError("Vui lòng quét hoặc nhập mã QR nhận phòng.");
      return null;
    }

    if (!silent) setLoading(true);
    setError("");
    if (!silent) setIdentityError("");
    try {
      const data = await verifyCheckInCode(normalized);
      setCode(normalized);
      setResult(data);
      setManualConfirmOpen(false);
      return data;
    } catch (requestError) {
      if (!silent) {
        setResult(null);
        setError(
          requestError.response?.data?.message
            ?? requestError.response?.data?.detail
            ?? "Không thể xác minh mã QR nhận phòng.",
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
          "Thanh toán PayOS đã hoàn tất. Đơn đặt phòng được khôi phục tự động, không cần quét lại QR.",
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
            "PayOS đã xác nhận thanh toán đủ. Đơn đặt phòng được cập nhật tự động và có thể nhận phòng ngay.",
          );
        } else {
          setMessage("Đã nhận xác nhận PayOS, đang hoàn tất đối soát đơn đặt phòng...");
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
      } catch {
        // Polling là best-effort. Không làm mất màn hình check-in chỉ vì một
        // lần gọi PayOS bị timeout; lần kế tiếp sẽ tự thử lại.
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

  async function processIdentityQr(rawValue, { silent = false } = {}) {
    const normalized = String(rawValue ?? "").trim();
    if (!normalized) {
      if (!silent) setIdentityError("Không đọc được thông tin từ mã QR CCCD.");
      return null;
    }
    if (!result?.booking?.id || !code) {
      if (!silent) setIdentityError("Hãy xác minh mã QR đặt phòng trước khi quét CCCD.");
      return null;
    }

    if (!silent) setIdentityLoading(true);
    setError("");
    setIdentityError("");
    setMessage("");

    try {
      const data = await verifyCheckInIdentity(
        result.booking.id,
        code,
        normalized,
      );
      setResult(data);

      if (data?.identityVerification?.status === "VERIFIED") {
        setIdentityError("");
      } else {
        setIdentityError(
          identityFailureLabel(data?.identityVerification?.failureReason),
        );
      }
      return data;
    } catch (requestError) {
      setIdentityError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.detail
          ?? requestError.message
          ?? "Không thể xác minh QR CCCD.",
      );
      return null;
    } finally {
      if (!silent) setIdentityLoading(false);
    }
  }

  async function startCamera(mode = "BOOKING") {
    if (mode === "IDENTITY") {
      setIdentityError("");
    } else {
      setError("");
    }
    setMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      const cameraMessage = "Thiết bị hoặc trình duyệt không hỗ trợ truy cập camera.";
      if (mode === "IDENTITY") setIdentityError(cameraMessage);
      else setError(cameraMessage);
      return;
    }

    stopCamera();
    lastDetectedRef.current = "";
    setCameraMode(mode);
    setCameraActive(true);
    setLoading(true);

    try {
      // Xin quyền camera trực tiếp trước để Chrome hiện prompt ngay và để UI
      // phân biệt rõ lỗi quyền camera với lỗi thư viện QR.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;

      if (!videoRef.current) {
        throw new Error("Không khởi tạo được vùng hiển thị camera.");
      }

      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play();

      if (mode === "IDENTITY") {
        // QR CCCD chứa nhiều dữ liệu hơn QR booking. ZXing Browser có thể
        // nhận ra mã nhưng không giải mã được, vì vậy chế độ CCCD dùng jsQR
        // đọc trực tiếp từng frame camera.
        let stopped = false;
        let scanning = false;
        let timerId = null;

        const controls = {
          stop() {
            stopped = true;
            if (timerId) window.clearInterval(timerId);
            timerId = null;
          },
        };

        const scanIdentityFrame = async () => {
          if (stopped || scanning || !videoRef.current) return;
          scanning = true;

          try {
            const rawValue = await decodeQrVideoElement(videoRef.current);
            if (!rawValue || rawValue === lastDetectedRef.current) return;

            lastDetectedRef.current = rawValue;
            controls.stop();
            qrControlsRef.current = null;

            if (cameraStreamRef.current) {
              cameraStreamRef.current.getTracks?.().forEach((track) => track.stop());
              cameraStreamRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            setCameraActive(false);

            void processIdentityQr(rawValue);
          } finally {
            scanning = false;
          }
        };

        timerId = window.setInterval(() => {
          void scanIdentityFrame();
        }, 220);

        qrControlsRef.current = controls;
        void scanIdentityFrame();
        return;
      }

      const qrLibrary = await loadZxingBrowser();
      qrLibraryRef.current = qrLibrary;
      const reader = new qrLibrary.BrowserQRCodeReader();

      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (scanResult, _scanError, callbackControls) => {
          const rawValue = getQrText(scanResult);
          if (!rawValue || rawValue === lastDetectedRef.current) return;

          lastDetectedRef.current = rawValue;
          callbackControls?.stop?.();
          qrControlsRef.current = null;

          if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks?.().forEach((track) => track.stop());
            cameraStreamRef.current = null;
          }
          if (videoRef.current) videoRef.current.srcObject = null;
          setCameraActive(false);

          void verify(rawValue);
        },
      );

      qrControlsRef.current = controls;
    } catch (cameraError) {
      stopCamera();

      let cameraMessage = cameraError?.message ?? "Không thể mở camera để quét QR.";
      if (cameraError?.name === "NotAllowedError" || cameraError?.name === "SecurityError") {
        cameraMessage = "Trình duyệt đang chặn camera. Hãy cho phép quyền Camera cho trang này rồi bấm Mở camera lại.";
      } else if (cameraError?.name === "NotFoundError" || cameraError?.name === "DevicesNotFoundError") {
        cameraMessage = "Không tìm thấy camera trên thiết bị này.";
      } else if (cameraError?.name === "NotReadableError" || cameraError?.name === "TrackStartError") {
        cameraMessage = "Camera đang được ứng dụng khác sử dụng hoặc Windows không cho trình duyệt truy cập.";
      } else if (cameraError?.name === "OverconstrainedError") {
        cameraMessage = "Camera không hỗ trợ cấu hình quét hiện tại. Hãy thử đóng/mở lại camera.";
      }
      if (mode === "IDENTITY") setIdentityError(cameraMessage);
      else setError(cameraMessage);
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
          "Đã đọc được QR nhưng mã nhận phòng không hợp lệ hoặc đơn đặt phòng không tồn tại.",
        );
      }

      setMessage("Đã đọc mã QR và xác minh đơn đặt phòng thành công.");
    } catch (scanError) {
      setResult(null);

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

  async function handleIdentityQrImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setIdentityError("");
    setMessage("");
    setIdentityLoading(true);

    try {
      const rawValue = await decodeQrImageFile(file);
      if (!rawValue) {
        throw new Error("Không tìm thấy nội dung trong QR CCCD.");
      }
      await processIdentityQr(rawValue, { silent: true });
    } catch (scanError) {
      setIdentityError(
        scanError?.message
          ?? "Không thể đọc QR CCCD từ ảnh. Hãy chọn ảnh rõ và thấy đầy đủ mã QR.",
      );
    } finally {
      setIdentityLoading(false);
    }
  }

  async function handleManualIdentityConfirm() {
    if (!result?.booking?.id || !code) {
      setIdentityError("Hãy xác minh mã QR đặt phòng trước khi kiểm tra giấy tờ.");
      return;
    }

    setIdentityLoading(true);
    setError("");
    setIdentityError("");
    setMessage("");

    try {
      const data = await verifyCheckInIdentityManual(result.booking.id, code);
      setResult(data);
      setManualConfirmOpen(false);
      setMessage(
        "Đã ghi nhận nhân viên khách sạn kiểm tra CCCD/Hộ chiếu trực tiếp tại quầy.",
      );
    } catch (requestError) {
      setIdentityError(
        requestError.response?.data?.message
          ?? requestError.response?.data?.detail
          ?? "Không thể xác nhận kiểm tra giấy tờ tại quầy.",
      );
    } finally {
      setIdentityLoading(false);
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

      if (!order.checkoutUrl) {
        throw new Error("PayOS không trả về đường dẫn thanh toán.");
      }

      window.open(
        order.checkoutUrl,
        "_blank",
        "noopener,noreferrer",
      );
      setMessage(
        "Đã tạo giao dịch PayOS. Nếu tab thanh toán chưa xuất hiện, chọn “Mở lại trang QR PayOS” bên dưới để tiếp tục.",
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
  const identity = result?.identityVerification;
  const identityVerified = identity?.status === "VERIFIED";
  const identityFailed = identity?.status === "FAILED";
  const identityMethod = identity?.method ?? null;
  const identityVerifiedManually = identityVerified && identityMethod === "MANUAL";
  const isDone = booking?.status === "CHECKED_IN";
  const hasRemaining = Number(booking?.remainingAmount ?? 0) > 0;
  const PageContainer = embedded ? "div" : "main";

  return (
    <PageContainer className="hotel-checkin-page">
      {!embedded ? <PageHeader
        className="hotel-checkin-heading"
        eyebrow="Vận hành lưu trú"
        title="Nhận phòng bằng QR"
        description="Quét mã của khách, đối chiếu thông tin và xác nhận nhận phòng ngay tại quầy."
        icon={<ScanLine size={22} />}
      /> : null}

      <ErrorMessage message={error} onRetry={code ? () => void verify(code) : undefined} />
      {message ? <div className="checkin-success-message" role="status"><CheckCircle2 size={19} />{message}</div> : null}
      {isDone ? <Link className="stay-management-next" to={stayManagementUrl("check-out")}>Xem khách đang lưu trú</Link> : null}

      <section className="checkin-scanner-card">
        <div className="checkin-scanner-copy">
          <span><ScanLine size={22} /></span>
          <div>
            <h2>Quét mã của khách</h2>
            <p>Quét mã QR, tải ảnh mã hoặc nhập mã nhận phòng của khách.</p>
          </div>
        </div>

        <div className="checkin-input-row">
          <div>
            <QrCode size={19} />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Nhập hoặc dán mã nhận phòng"
              aria-label="Mã QR nhận phòng"
              onKeyDown={(event) => {
                if (event.key === "Enter") void verify(code);
              }}
            />
          </div>
          <button type="button" onClick={() => void verify(code)} disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <BadgeCheck size={18} />}
            Tra cứu đặt phòng
          </button>
        </div>

        <div className="checkin-scan-actions">
          <button
            type="button"
            onClick={cameraActive ? stopCamera : () => void startCamera("BOOKING")}
          >
            {cameraActive ? <Square size={18} /> : <Camera size={18} />}
            {cameraActive
              ? cameraMode === "IDENTITY"
                ? "Dừng quét CCCD"
                : "Dừng camera"
              : "Mở camera"}
          </button>
          <label>
            <FileImage size={18} />
            Đọc QR từ ảnh
            <input type="file" accept="image/*" onChange={handleQrImage} />
          </label>
        </div>

        <div
          className={`checkin-camera-frame ${cameraActive ? "is-active" : "is-hidden"}`}
          aria-hidden={!cameraActive}
        >
          <video ref={videoRef} muted playsInline autoPlay aria-label="Camera quét mã QR" />
          <div className="checkin-camera-guide"><span /></div>
          <div className="checkin-camera-mode-label">
            {cameraMode === "IDENTITY" ? "Đang quét QR trên CCCD" : "Đang quét mã QR đặt phòng"}
          </div>
        </div>
      </section>

      {result ? (
        <section className={`checkin-result-card ${result.canCheckIn ? "ready" : "attention"}`}>
          <div className="checkin-result-header">
            <div className="checkin-result-icon">
              {isDone ? <CheckCircle2 size={30} /> : result.canCheckIn ? <BadgeCheck size={30} /> : <ShieldAlert size={30} />}
            </div>
            <div>
              <span>ĐƠN ĐẶT PHÒNG ĐÃ XÁC MINH</span>
              <h2>{booking.bookingCode || "Chưa có mã đặt phòng"}</h2>
              <p>{result.actionMessage}</p>
            </div>
            <div className="checkin-result-header-actions">
              <StatusBadge status={booking.status} size="sm" />
              <button type="button" onClick={() => void verify(code)}>
                <RefreshCw size={17} /> Kiểm tra lại
              </button>
            </div>
          </div>

          <div className="checkin-result-grid">
            <div className="checkin-guest-card">
              <h3><UserRound size={19} /> Thông tin khách</h3>
              <strong>{guestName(booking)}</strong>
              {booking.guestPhone || booking.bookerPhone ? <span>{booking.guestPhone || booking.bookerPhone}</span> : null}
              {booking.bookerEmail ? <span>{booking.bookerEmail}</span> : null}
              <div>
                <Users size={17} />
                {guestSummary(booking)}
              </div>
            </div>

            <div className="checkin-stay-card">
              <h3><Hotel size={19} /> Thông tin lưu trú</h3>
              <strong>{result.hotelName || "Chưa cập nhật tên khách sạn"}</strong>
              {result.hotelAddress ? <span><MapPin size={15} /> {result.hotelAddress}</span> : null}
              <div className="checkin-stay-room">
                <BedDouble size={18} />
                <div>
                  <small>{result.roomTypeName || "Chưa cập nhật loại phòng"}</small>
                  <strong>{result.roomNumber ? `Phòng ${result.roomNumber}` : "Chưa cập nhật số phòng"}</strong>
                </div>
              </div>
              <div className="checkin-date-row">
                <span>
                  <small>Nhận phòng</small>
                  <strong>{formatDate(booking.checkIn)}</strong>
                  <em>Từ {formatTimeFromDateTime(result.expectedCheckInAt)}</em>
                </span>
                <span>
                  <small>Trả phòng</small>
                  <strong>{formatDate(booking.checkOut)}</strong>
                  <em>Trước {formatTimeFromDateTime(result.expectedCheckOutAt)}</em>
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
              <div><span>Tổng đơn</span><strong>{money(booking.totalPrice)}</strong></div>
              <div><span>Đã thanh toán</span><strong className="paid">{money(booking.paidAmount)}</strong></div>
              <div><span>Còn phải thu</span><strong className="remaining">{money(booking.remainingAmount)}</strong></div>
            </div>
          </div>

          <section className={`checkin-identity-card ${
            identityVerified ? "verified" : identityFailed ? "failed" : "pending"
          }`}>
            <div className="checkin-identity-header">
              <span className="checkin-identity-icon">
                {identityVerified ? <BadgeCheck size={23} /> : <QrCode size={23} />}
              </span>
              <div>
                <small>XÁC MINH GIẤY TỜ TÙY THÂN</small>
                <h3>CCCD/Hộ chiếu · {identitySubjectLabel()}</h3>
                <p>
                  {identityVerifiedManually
                    ? "Nhân viên khách sạn đã đối chiếu giấy tờ trực tiếp tại quầy và xác nhận thông tin hợp lệ."
                    : identityVerified
                      ? "Ngày sinh và điều kiện đủ 18 tuổi đã được xác minh từ mã QR CCCD."
                      : identityFailed
                        ? identityFailureLabel(identity?.failureReason)
                        : "Quét mã QR CCCD để kiểm tra ngày sinh, độ tuổi hoặc đối chiếu giấy tờ trực tiếp tại quầy. Họ tên không bắt buộc phải trùng với tên tài khoản."}
                </p>
              </div>
              <strong className="checkin-identity-status">
                {identityVerified ? "ĐÃ XÁC MINH" : identityFailed ? "CHƯA ĐẠT" : "CHỜ XÁC MINH"}
              </strong>
            </div>

            {identityError ? (
              <div className="checkin-identity-alert" role="alert">
                <span className="checkin-identity-alert-icon">
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <strong>Thông tin xác minh chưa khớp</strong>
                  <span>{identityError}</span>
                </div>
                {!isDone ? (
                  <button
                    type="button"
                    onClick={() => void startCamera("IDENTITY")}
                    disabled={identityLoading || cameraActive}
                  >
                    Quét lại
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="checkin-identity-details">
              <div>
                <span>Người đứng tên đặt phòng</span>
                <strong>{identity?.subjectName || guestName(booking)}</strong>
              </div>
              <div>
                <span>Ngày sinh đã khai</span>
                <strong>
                  {identity?.expectedDateOfBirth
                    ? formatDate(identity.expectedDateOfBirth)
                    : "Không bắt buộc đối chiếu DOB"}
                </strong>
              </div>
              <div>
                <span>Họ tên trên giấy tờ</span>
                <strong>
                  {identityVerifiedManually
                    ? "Đã kiểm tra trực tiếp"
                    : identityMethod === "QR_CCCD"
                      ? "Không bắt buộc đối chiếu"
                      : "Chưa kiểm tra"}
                </strong>
              </div>
              <div>
                <span>Ngày sinh giấy tờ</span>
                <strong className={identityVerifiedManually ? "good" : identity?.dateOfBirthMatched === false ? "bad" : identity?.dateOfBirthMatched ? "good" : ""}>
                  {identityVerifiedManually
                    ? "Đã đối chiếu trực tiếp"
                    : identity?.dateOfBirthMatched == null
                      ? "Chưa kiểm tra"
                      : identity.dateOfBirthMatched
                        ? "Khớp"
                        : "Không khớp"}
                </strong>
              </div>
              <div>
                <span>Độ tuổi khi nhận phòng</span>
                <strong className={identity?.ageEligible === false ? "bad" : identity?.ageEligible ? "good" : ""}>
                  {identity?.ageAtCheckIn == null
                    ? identityVerifiedManually
                      ? "Đã xác nhận đủ 18 tuổi"
                      : "Chưa kiểm tra"
                    : `${identity.ageAtCheckIn} tuổi · ${identity.ageEligible ? "Đủ 18+" : "Chưa đủ 18"}`}
                </strong>
              </div>
              <div>
                <span>Phương thức xác minh</span>
                <strong>
                  {identityVerifiedManually
                    ? "Kiểm tra trực tiếp tại quầy"
                    : identityMethod === "QR_CCCD"
                      ? `QR CCCD${identity?.identityNumberLast4 ? ` · •••• ${identity.identityNumberLast4}` : ""}`
                      : "Chưa chọn"}
                </strong>
              </div>
            </div>

            {!isDone ? (
              <div className="checkin-identity-actions">
                <button
                  type="button"
                  onClick={() => void startCamera("IDENTITY")}
                  disabled={identityLoading || cameraActive}
                >
                  <Camera size={18} />
                  {identityLoading ? "Đang xác minh..." : identityVerified ? "Quét lại QR CCCD" : "Quét QR CCCD"}
                </button>
                <label className={identityLoading ? "disabled" : ""}>
                  <FileImage size={18} />
                  Đọc QR CCCD từ ảnh
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleIdentityQrImage}
                    disabled={identityLoading}
                  />
                </label>
                <button
                  type="button"
                  className="checkin-manual-verify-button"
                  onClick={() => {
                    setIdentityError("");
                    setManualConfirmOpen(true);
                  }}
                  disabled={identityLoading || cameraActive}
                >
                  <ShieldCheck size={18} />
                  {identityVerifiedManually ? "Kiểm tra lại trực tiếp" : "Đã kiểm tra CCCD trực tiếp"}
                </button>
              </div>
            ) : null}

            {!isDone && manualConfirmOpen ? (
              <div className="checkin-manual-confirm" role="dialog" aria-label="Xác nhận kiểm tra giấy tờ trực tiếp">
                <span className="checkin-manual-confirm-icon"><ShieldCheck size={20} /></span>
                <div>
                  <strong>Xác nhận đã kiểm tra giấy tờ tại quầy</strong>
                  <p>
                    Tôi đã đối chiếu trực tiếp họ tên và ngày sinh trên CCCD/Hộ chiếu với thông tin người nhận phòng,
                    đồng thời xác nhận người này đủ 18 tuổi.
                  </p>
                </div>
                <div className="checkin-manual-confirm-actions">
                  <button type="button" onClick={() => setManualConfirmOpen(false)} disabled={identityLoading}>Hủy</button>
                  <button type="button" className="confirm" onClick={() => void handleManualIdentityConfirm()} disabled={identityLoading}>
                    {identityLoading ? <LoaderCircle className="spin" size={17} /> : <BadgeCheck size={17} />}
                    {identityLoading ? "Đang lưu..." : "Xác nhận đã kiểm tra"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

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
                {working === "CHECK_IN" ? "Đang xác nhận..." : "Xác nhận nhận phòng"}
              </button>
            ) : (
              <div className="checkin-completed-badge">
                <CheckCircle2 size={20} /> Khách đã nhận phòng
              </div>
            )}
          </div>

          {!isDone && (!result.paymentComplete || !identityVerified) ? (
            <div className="checkin-warning-note">
              <Clock3 size={18} />
              <span>
                {!result.paymentComplete
                  ? "Nút nhận phòng chỉ được mở sau khi số tiền còn lại bằng 0 ₫ và giấy tờ đã được xác minh."
                  : "Thanh toán đã hoàn tất. Hãy quét QR CCCD hoặc xác nhận đã kiểm tra giấy tờ trực tiếp để mở nút nhận phòng."}
                {!result.paymentComplete
                  ? " Nếu thu tiền mặt tại quầy, hoa hồng vẫn được hạch toán qua Payment Service."
                  : ""}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageContainer>
  );
}
