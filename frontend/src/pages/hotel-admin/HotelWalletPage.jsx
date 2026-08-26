import {
  ArrowDownToLine,
  Banknote,
  Clock3,
  History,
  ImageUp,
  FileImage,
  CheckCircle2,
  LockKeyhole,
  X,
  QrCode,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  Button,
  EmptyState,
  Modal,
  PageHeader,
  StatusBadge,
} from "../../components/ui";
import { getBooking } from "../../services/bookingService";
import {
  createHotelWithdrawal,
  createWalletTopUp,
  getMyWallet,
  getMyWalletTransactions,
  getMyWithdrawals,
  getWithdrawalReceiverQr,
  getWithdrawalTransferProof,
  getHotelRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
  submitHotelRefundProof,
  getRefundHotelProof,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  normalizeEnum,
  REASON_LABELS,
  STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/presentation";
import "../shared/WalletPage.css";
import "./HotelWalletPage.css";

const INITIAL_FORM = {
  amount: "",
  payoutMethod: "BANK_ACCOUNT",
  bankName: "",
  bankBin: "",
  accountNumber: "",
  accountName: "",
};

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function transactionLabel(type) {
  const labels = {
    HOTEL_REVENUE_PENDING: "Doanh thu đang giữ",
    HOTEL_REVENUE_RELEASED: "Doanh thu khả dụng",
    WITHDRAWAL_HOLD: "Khóa tiền rút",
    WITHDRAWAL_RELEASED: "Hoàn tiền khóa",
    WITHDRAWAL_PAID: "Đã rút tiền",
    WALLET_TOP_UP: "Nạp tiền vào ví",
    CASH_REVENUE_RECORDED: "Doanh thu tiền mặt ngoài ví",
    HOTEL_COMMISSION_DEBIT: "Hoa hồng đã khấu trừ",
    HOTEL_COMMISSION_DEBT_ACCRUED: "Công nợ hoa hồng phát sinh",
    HOTEL_COMMISSION_DEBT_SETTLED: "Cấn trừ công nợ hoa hồng",
  };
  const normalized = normalizeEnum(type);
  return labels[normalized]
    ?? TRANSACTION_TYPE_LABELS[normalized]
    ?? "Chưa xác định";
}

function refundReasonLabel(value) {
  const normalized = normalizeEnum(value);
  return ({
    HOTEL_AGREED: "Khách sạn đồng ý hoàn",
    DUPLICATE_PAYMENT: "Thanh toán trùng",
  }[normalized] ?? REASON_LABELS[normalized] ?? "Chưa có lý do");
}

function withdrawalStatusLabel(value) {
  return STATUS_LABELS[normalizeEnum(value)] ?? "Chưa xác định";
}

function payoutMethodLabel(value) {
  const normalized = normalizeEnum(value);
  if (normalized === "PERSONAL_QR") return "QR cá nhân";
  if (normalized === "BANK_AND_QR") return "Ngân hàng + QR cá nhân";
  if (normalized === "BANK_ACCOUNT") return "Tài khoản ngân hàng";
  return "Chưa xác định";
}

function refundPolicyLabel(value) {
  return ({
    NO_SHOW_REVIEW: "Xem xét trường hợp không đến",
    STANDARD_REFUND: "Chính sách hoàn tiền tiêu chuẩn",
    HOTEL_AGREEMENT: "Thỏa thuận với khách sạn",
  }[normalizeEnum(value)] ?? "Chưa cập nhật chính sách");
}

function bookingCustomerName(booking) {
  if (!booking) return "Chưa cập nhật tên";
  const booker = [booking.bookerLastName, booking.bookerFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const guest = [booking.guestLastName, booking.guestFirstName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const primaryName = booking.bookerIsGuest === false ? guest : booker;
  const secondaryName = booking.bookerIsGuest === false ? booker : guest;
  return primaryName
    || secondaryName
    || booking.customerName
    || booking.customerEmail
    || booking.bookerEmail
    || booking.guestEmail
    || "Chưa cập nhật tên";
}

function refundAccountSummary(item) {
  return [item?.refundBankName, item?.refundAccountNumber]
    .filter(Boolean)
    .join(" · ") || "Chưa cập nhật tài khoản nhận";
}

export default function HotelWalletPage() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [qrImage, setQrImage] = useState(null);
  const [qrPreview, setQrPreview] = useState("");
  const [historyQr, setHistoryQr] = useState(null);
  const [historyQrUrl, setHistoryQrUrl] = useState("");
  const [proofWithdrawal, setProofWithdrawal] = useState(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofLoadingId, setProofLoadingId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refundRequests, setRefundRequests] = useState([]);
  const [refundBookings, setRefundBookings] = useState({});
  const [refundError, setRefundError] = useState("");
  const [refundBusyId, setRefundBusyId] = useState("");
  const [refundDecision, setRefundDecision] = useState(null);
  const [refundDraft, setRefundDraft] = useState(null);
  const [refundProofItem, setRefundProofItem] = useState(null);
  const [refundProofUrl, setRefundProofUrl] = useState("");

  const needBank = ["BANK_ACCOUNT", "BANK_AND_QR"].includes(form.payoutMethod);
  const needQr = ["PERSONAL_QR", "BANK_AND_QR"].includes(form.payoutMethod);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setRefundError("");
    try {
      const [walletData, transactionData, withdrawalData, refundResult] = await Promise.all([
        getMyWallet(),
        getMyWalletTransactions(),
        getMyWithdrawals(),
        getHotelRefundRequests()
          .then((data) => ({ data, error: null }))
          .catch((requestError) => ({ data: [], error: requestError })),
      ]);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
      const nextRefundRequests = Array.isArray(refundResult.data) ? refundResult.data : [];
      setRefundRequests(nextRefundRequests);

      if (refundResult.error) {
        setRefundError(
          refundResult.error.response?.data?.message
            ?? "Không thể tải danh sách yêu cầu hoàn tiền.",
        );
        setRefundBookings({});
      } else {
        const bookingIds = [...new Set(
          nextRefundRequests.map((item) => item.bookingId).filter(Boolean),
        )];
        const bookingResults = await Promise.allSettled(
          bookingIds.map(async (bookingId) => [bookingId, await getBooking(bookingId)]),
        );
        setRefundBookings(Object.fromEntries(
          bookingResults
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value),
        ));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải ví khách sạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh("NOTIFICATION_CREATED", load, { debounceMs: 120 });

  useEffect(() => {
    if (!qrImage) {
      setQrPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(qrImage);
    setQrPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qrImage]);

  useEffect(() => () => {
    if (historyQrUrl) URL.revokeObjectURL(historyQrUrl);
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
  }, [historyQrUrl, proofUrl, refundProofUrl]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleQrChange(event) {
    const file = event.target.files?.[0] ?? null;
    if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("QR cá nhân chỉ hỗ trợ PNG, JPG/JPEG hoặc WEBP.");
      event.target.value = "";
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setError("Ảnh QR tối đa 5MB.");
      event.target.value = "";
      return;
    }
    setError("");
    setQrImage(file);
  }

  async function handleTopUp(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const order = await createWalletTopUp(Number(topUpAmount));
      sessionStorage.setItem(
        "enziuroomsPayOsOrder",
        JSON.stringify({ orderCode: order.orderCode, bookingIds: [], walletTopUp: true }),
      );
      if (!order.checkoutUrl) throw new Error("PayOS không trả về đường dẫn thanh toán.");
      window.location.assign(order.checkoutUrl);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.message
          ?? "Không thể tạo giao dịch nạp tiền.",
      );
      setSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (needQr && !qrImage) {
        throw new Error("Bạn đã chọn nhận bằng QR, vui lòng tải mã QR cá nhân.");
      }

      const payload = new FormData();
      payload.append("amount", String(Number(form.amount)));
      payload.append("payoutMethod", form.payoutMethod);
      if (needBank) {
        payload.append("bankName", form.bankName.trim());
        payload.append("bankBin", form.bankBin.trim());
        payload.append("accountNumber", form.accountNumber.trim());
        payload.append("accountName", form.accountName.trim().toUpperCase());
      }
      if (needQr && qrImage) payload.append("qrImage", qrImage);

      await createHotelWithdrawal(payload);
      setMessage(
        "Đã gửi yêu cầu rút tiền. Số tiền sẽ được giữ lại cho đến khi yêu cầu được xử lý.",
      );
      setForm((current) => ({
        ...INITIAL_FORM,
        bankName: current.bankName,
        bankBin: current.bankBin,
      }));
      setQrImage(null);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.message
          ?? "Không thể tạo yêu cầu rút tiền.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function openHistoryQr(item) {
    setError("");
    try {
      const blob = await getWithdrawalReceiverQr(item.id);
      if (historyQrUrl) URL.revokeObjectURL(historyQrUrl);
      const url = URL.createObjectURL(blob);
      setHistoryQr(item);
      setHistoryQrUrl(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải QR yêu cầu rút tiền.");
    }
  }

  async function openTransferProof(item) {
    setProofLoadingId(item.id);
    setError("");

    try {
      const blob = await getWithdrawalTransferProof(item.id);

      if (proofUrl) {
        URL.revokeObjectURL(proofUrl);
      }

      const url = URL.createObjectURL(blob);
      setProofWithdrawal(item);
      setProofUrl(url);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải chứng từ chuyển khoản.",
      );
    } finally {
      setProofLoadingId("");
    }
  }

  function closeTransferProof() {
    setProofWithdrawal(null);
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    setProofUrl("");
  }

  async function handleApproveRefund(item, note = "") {
    setRefundBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await approveRefundRequest(item.id, note);
      setRefundDecision(null);
      setMessage("Đã duyệt yêu cầu hoàn tiền. Các phần tiền sẽ được xử lý đúng theo nơi đang giữ tiền.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể duyệt yêu cầu hoàn tiền.");
    } finally {
      setRefundBusyId("");
    }
  }

  async function handleRejectRefund(item, note) {
    if (!note?.trim()) return;
    setRefundBusyId(item.id);
    setError("");
    try {
      await rejectRefundRequest(item.id, note.trim());
      setRefundDecision(null);
      setMessage("Đã từ chối yêu cầu hoàn tiền và thông báo cho khách.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể từ chối yêu cầu hoàn tiền.");
    } finally {
      setRefundBusyId("");
    }
  }

  async function submitRefundProof(event) {
    event.preventDefault();
    if (!refundDraft?.item || !refundDraft?.reference?.trim() || !refundDraft?.file) return;
    const item = refundDraft.item;
    setRefundBusyId(item.id);
    setError("");
    try {
      await submitHotelRefundProof(item.id, refundDraft.reference.trim(), refundDraft.file);
      setRefundDraft(null);
      setMessage("Đã lưu chứng từ hoàn tiền trực tiếp cho khách.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể lưu chứng từ hoàn tiền.");
    } finally {
      setRefundBusyId("");
    }
  }

  async function openHotelRefundProof(item) {
    setRefundBusyId(item.id);
    try {
      const blob = await getRefundHotelProof(item.id);
      if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
      setRefundProofUrl(URL.createObjectURL(blob));
      setRefundProofItem(item);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải chứng từ hoàn tiền.");
    } finally {
      setRefundBusyId("");
    }
  }

  function refundStatusLabel(value) {
    return ({
      PENDING_HOTEL_REVIEW: "Chờ duyệt",
      APPROVED: "Đã duyệt",
      PARTIALLY_COMPLETED: "Đã hoàn một phần",
      COMPLETED: "Hoàn tất",
      REJECTED: "Từ chối",
    }[normalizeEnum(value)] ?? STATUS_LABELS[normalizeEnum(value)] ?? "Chưa xác định");
  }

  const cards = useMemo(() => [
    ["Số dư khả dụng", wallet?.availableBalance, WalletCards],
    ["Doanh thu đang giữ", wallet?.pendingBalance, Clock3],
    ["Công nợ hoa hồng", wallet?.commissionDebt, ShieldAlert],
    ["Đang chờ rút", wallet?.lockedBalance, LockKeyhole],
    ["Tổng đã rút", wallet?.totalWithdrawn, ArrowDownToLine],
  ], [wallet]);

  if (loading && !wallet) {
    return <Loading message="Đang tải ví và dữ liệu đối soát..." />;
  }

  const pageHeader = (
    <PageHeader
      eyebrow="Tài chính"
      title="Ví & đối soát khách sạn"
      description="Theo dõi số dư, khoản đang giữ, yêu cầu hoàn của khách và lịch sử rút tiền từ dữ liệu giao dịch thực tế."
      icon={<WalletCards size={22} />}
      actions={(
        <button className="wallet-refresh-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={18} className={loading ? "spin" : ""} /> Làm mới
        </button>
      )}
    />
  );

  if (!wallet) {
    return (
      <main className="wallet-page hotel-wallet-page">
        {pageHeader}
        <ErrorMessage message={error} onRetry={() => void load()} />
        <EmptyState
          icon={<WalletCards size={30} />}
          title="Chưa thể hiển thị dữ liệu ví"
          description="Hãy thử tải lại để nhận số dư và lịch sử giao dịch mới nhất."
        />
      </main>
    );
  }

  return (
    <main className="wallet-page hotel-wallet-page">
      {pageHeader}

      <ErrorMessage message={error} onRetry={() => void load()} />
      {message ? <div className="wallet-message" role="status">{message}</div> : null}

      <section className="wallet-balance-grid">
        {cards.map(([label, value, Icon]) => (
          <article className="wallet-balance-card" key={label}>
            <div className="icon"><Icon size={21} /></div>
            <div><small>{label}</small><strong>{money(value)}</strong></div>
          </article>
        ))}
      </section>

      {Number(wallet?.commissionDebt ?? 0) > 0 ? (
        <div className="wallet-debt-notice">
          <ShieldAlert size={19} />
          <div>
            <strong>Còn {money(wallet.commissionDebt)} công nợ hoa hồng</strong>
            <span>
              Công nợ sẽ được cấn trừ trước khi số dư trở thành khả dụng để rút.
            </span>
          </div>
        </div>
      ) : null}

      <section className="wallet-content-grid">
        <div className="wallet-panel">
          <div className="wallet-panel-header">
            <h2><History size={18} /> Giao dịch gần đây</h2>
            <span>{transactions.length} giao dịch</span>
          </div>
          <div className="wallet-table-wrap">
            <table className="wallet-table">
              <thead><tr><th>Thời gian</th><th>Nội dung</th><th>Tham chiếu</th><th>Số tiền</th></tr></thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Thời gian">{dateTime(item.createdAt)}</td>
                    <td data-label="Nội dung"><strong>{transactionLabel(item.type)}</strong>{item.description ? <><br /><small>{item.description}</small></> : null}</td>
                    <td data-label="Tham chiếu"><small className="hotel-wallet-system-reference">{item.paymentId ?? item.paymentOrderId ?? item.withdrawalId ?? "—"}</small></td>
                    <td data-label="Số tiền" className={Number(item.amount) >= 0 ? "wallet-money-positive" : "wallet-money-negative"}>
                      {Number(item.amount) > 0 ? "+" : ""}{money(item.amount)}
                    </td>
                  </tr>
                ))}
                {!loading && transactions.length === 0 ? (
                  <tr><td colSpan="4" className="wallet-empty">Chưa có giao dịch ví.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="wallet-side-stack">
          <aside className="wallet-panel">
            <div className="wallet-panel-header"><h2><WalletCards size={18} /> Nạp tiền vào ví</h2></div>
            <form className="wallet-form" onSubmit={handleTopUp}>
              <label>Số tiền muốn nạp
                <input
                  type="number"
                  min="2000"
                  max="100000000"
                  step="1000"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  required
                />
              </label>
              <div className="wallet-helper">
                Bạn sẽ được chuyển sang PayOS. Sau khi giao dịch được xác nhận, số dư ví được cộng tương ứng.
              </div>
              <button className="wallet-primary-button" type="submit" disabled={submitting}>
                <WalletCards size={18} /> {submitting ? "Đang tạo link..." : "Nạp qua PayOS"}
              </button>
            </form>
          </aside>

          <aside className="wallet-panel">
            <div className="wallet-panel-header"><h2><Banknote size={18} /> Yêu cầu rút tiền</h2></div>
            <form className="wallet-form" onSubmit={handleSubmit}>
              <label>Số tiền muốn rút
                <input name="amount" type="number" min="10000" step="1000" value={form.amount} onChange={handleChange} required />
              </label>

              <label>Nhận tiền bằng
                <select name="payoutMethod" value={form.payoutMethod} onChange={handleChange}>
                  <option value="BANK_ACCOUNT">Tài khoản ngân hàng</option>
                  <option value="PERSONAL_QR">Mã QR cá nhân</option>
                  <option value="BANK_AND_QR">Cả ngân hàng và QR cá nhân</option>
                </select>
              </label>

              {needBank ? (
                <>
                  <div className="wallet-form-row">
                    <label>Ngân hàng
                      <input name="bankName" value={form.bankName} onChange={handleChange} placeholder="Nhập tên ngân hàng" required />
                    </label>
                    <label>Mã BIN
                      <input name="bankBin" inputMode="numeric" maxLength="6" value={form.bankBin} onChange={handleChange} required />
                    </label>
                  </div>
                  <label>Số tài khoản
                    <input name="accountNumber" inputMode="numeric" value={form.accountNumber} onChange={handleChange} required />
                  </label>
                  <label>Tên chủ tài khoản
                    <input name="accountName" value={form.accountName} onChange={handleChange} placeholder="Nhập tên chủ tài khoản" required />
                  </label>
                </>
              ) : null}

              {needQr ? (
                <div className="wallet-qr-upload">
                  <label className="wallet-upload-label">
                    <ImageUp size={19} />
                    <span>Tải mã QR cá nhân nhận tiền</span>
                    <small>PNG/JPG/WEBP · tối đa 5MB</small>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleQrChange} required />
                  </label>
                  {qrPreview ? (
                    <div className="wallet-qr-preview">
                      <img src={qrPreview} alt="QR nhận tiền đã chọn" />
                      <span><QrCode size={16} /> QR sẽ được lưu riêng trong yêu cầu rút tiền.</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="wallet-helper wallet-helper-real">
                <strong>Quy trình rút tiền:</strong> Yêu cầu sẽ được kiểm tra theo thông tin nhận tiền bạn cung cấp. Khi hoàn tất, bạn có thể xem mã giao dịch và chứng từ chuyển khoản.
              </div>
              <button
                className="wallet-primary-button"
                type="submit"
                disabled={
                  submitting
                  || Number(wallet?.commissionDebt ?? 0) > 0
                  || Number(form.amount) > Number(wallet?.availableBalance ?? 0)
                }
              >
                <ArrowDownToLine size={18} /> {submitting ? "Đang gửi..." : "Gửi yêu cầu rút"}
              </button>
            </form>
          </aside>
        </div>
      </section>

      <section className="wallet-panel refund-workflow-panel">
        <div className="wallet-panel-header">
          <h2><CheckCircle2 size={18} /> Hoàn tiền cần xử lý</h2>
          <span>{refundError ? "Chưa tải được" : `${refundRequests.length} yêu cầu`}</span>
        </div>
        <div className="wallet-helper wallet-helper-real">
          Đơn “Không đến” không tự động được hoàn. Khi khách sạn duyệt, EnziuRooms xử lý phần nền tảng đang giữ; phần khách sạn đã thu trực tiếp cần được hoàn và lưu chứng từ.
        </div>
        <ErrorMessage message={refundError} onRetry={() => void load()} />
        <div className="wallet-table-wrap">
          <table className="wallet-table hotel-refund-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Đơn đặt phòng</th>
                <th>Khách đã trả</th>
                <th>EnziuRooms giữ</th>
                <th>Khách sạn đã thu</th>
                <th>Lý do</th>
                <th>Chính sách</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {refundRequests.map((item) => {
                const booking = refundBookings[String(item.bookingId)] ?? null;
                return (
                  <tr key={`hotel-refund-${item.id}`}>
                    <td data-label="Khách hàng">
                      <strong>{bookingCustomerName(booking)}</strong>
                      {booking?.bookerEmail || booking?.customerEmail ? (
                        <><br /><small>{booking.bookerEmail ?? booking.customerEmail}</small></>
                      ) : null}
                    </td>
                    <td data-label="Đơn đặt phòng">
                      <strong>{item.bookingCode || "Chưa có mã"}</strong>
                      <br /><small>{dateTime(item.requestedAt)}</small>
                    </td>
                    <td data-label="Khách đã trả"><strong>{money(item.totalPaidAmount)}</strong></td>
                    <td data-label="EnziuRooms giữ"><strong>{money(item.platformHeldAmount)}</strong></td>
                    <td data-label="Khách sạn đã thu">
                      <strong>{money(item.hotelDirectAmount)}</strong>
                      {Number(item.manualReconciliationAmount ?? 0) > 0 ? (
                        <><br /><small>Đối soát: {money(item.manualReconciliationAmount)}</small></>
                      ) : null}
                    </td>
                    <td data-label="Lý do">
                      <strong>{refundReasonLabel(item.reasonCode)}</strong>
                      {item.customerNote ? <><br /><small>{item.customerNote}</small></> : null}
                    </td>
                    <td data-label="Chính sách">
                      <strong>{refundPolicyLabel(item.policyCode)}</strong>
                      {item.policyMessage ? <><br /><small>{item.policyMessage}</small></> : null}
                    </td>
                    <td data-label="Trạng thái">
                      <StatusBadge status={item.status} label={refundStatusLabel(item.status)} size="sm" />
                    </td>
                    <td data-label="Thao tác">
                      <div className="wallet-actions">
                        {item.status === "PENDING_HOTEL_REVIEW" ? (
                          <>
                            <button className="primary" type="button" disabled={refundBusyId === item.id} onClick={() => setRefundDecision({ item, type: "approve", note: "" })}>Duyệt</button>
                            <button className="danger" type="button" disabled={refundBusyId === item.id} onClick={() => setRefundDecision({ item, type: "reject", note: "" })}>Từ chối</button>
                          </>
                        ) : null}
                        {["APPROVED", "PARTIALLY_COMPLETED"].includes(item.status) && Number(item.hotelDirectAmount ?? 0) > 0 && !item.hotelRefundCompleted ? (
                          <button className="primary" type="button" onClick={() => setRefundDraft({ item, reference: "", file: null })}>Đã hoàn trực tiếp</button>
                        ) : null}
                        {item.hotelRefundProofAvailable ? (
                          <button className="wallet-proof-view-button" type="button" disabled={refundBusyId === item.id} onClick={() => void openHotelRefundProof(item)}>Xem chứng từ</button>
                        ) : null}
                      </div>
                      {Number(item.hotelDirectAmount ?? 0) > 0 ? (
                        <div className="refund-bank-mini">
                          {refundAccountSummary(item)}
                          {item.refundAccountName ? <><br />{item.refundAccountName}</> : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!loading && refundRequests.length === 0 ? (
                <tr>
                  <td colSpan="9" className="wallet-empty">
                    {refundError
                      ? "Chưa thể tải danh sách yêu cầu hoàn tiền."
                      : "Chưa có yêu cầu hoàn tiền từ khách."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header"><h2>Lịch sử yêu cầu rút</h2><span>{withdrawals.length} yêu cầu</span></div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Ngày yêu cầu</th><th>Phương thức nhận</th><th>Số tiền</th><th>Trạng thái</th><th>Ghi chú / chứng từ</th></tr></thead>
            <tbody>
              {withdrawals.map((item) => (
                <tr key={item.id}>
                  <td data-label="Ngày yêu cầu">{dateTime(item.requestedAt)}</td>
                  <td data-label="Phương thức nhận">
                    <strong>{payoutMethodLabel(item.payoutMethod)}</strong>
                    {item.bankName ? <><br /><small>{item.bankName} · {item.accountNumber} · {item.accountName}</small></> : null}
                    {item.receiverQrAvailable ? (
                      <><br /><button className="wallet-inline-link" type="button" onClick={() => openHistoryQr(item)}>Xem QR đã gửi</button></>
                    ) : null}
                  </td>
                  <td data-label="Số tiền">{money(item.amount)}</td>
                  <td data-label="Trạng thái"><StatusBadge status={item.status} label={withdrawalStatusLabel(item.status)} size="sm" /></td>
                  <td data-label="Ghi chú / chứng từ">
                    {item.reviewNote ? <div className="wallet-withdrawal-note">{item.reviewNote}</div> : null}
                    {item.failureReason ? <div className="wallet-withdrawal-failure">{item.failureReason}</div> : null}

                    {item.payoutReference ? (
                      <div className="wallet-payout-reference">
                        <small>Mã giao dịch</small>
                        <strong>{item.payoutReference}</strong>
                      </div>
                    ) : null}

                    {item.transferProofAvailable ? (
                      <button
                        className="wallet-proof-view-button"
                        type="button"
                        disabled={proofLoadingId === item.id}
                        onClick={() => openTransferProof(item)}
                      >
                        <FileImage size={16} />
                        {proofLoadingId === item.id
                          ? "Đang tải chứng từ..."
                          : "Xem chứng từ chuyển khoản"}
                      </button>
                    ) : (
                      <small className="wallet-proof-pending">
                        {item.status === "PAID"
                          ? "Chưa có ảnh chứng từ để hiển thị."
                          : "Chứng từ sẽ xuất hiện sau khi yêu cầu được hoàn tất."}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && withdrawals.length === 0 ? (
                <tr><td colSpan="5" className="wallet-empty">Chưa có yêu cầu rút tiền.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(refundDecision)}
        onClose={refundBusyId ? undefined : () => setRefundDecision(null)}
        title={refundDecision?.type === "approve" ? "Duyệt yêu cầu hoàn tiền" : "Từ chối yêu cầu hoàn tiền"}
        description={refundDecision?.item?.bookingCode
          ? `Đơn ${refundDecision.item.bookingCode}`
          : "Yêu cầu hoàn tiền của khách"}
        size="sm"
        closeOnBackdrop={!refundBusyId}
        closeOnEscape={!refundBusyId}
        hideCloseButton={Boolean(refundBusyId)}
        footer={(
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={Boolean(refundBusyId)}
              onClick={() => setRefundDecision(null)}
            >
              Hủy
            </Button>
            <Button
              variant={refundDecision?.type === "approve" ? "primary" : "danger"}
              type="button"
              loading={Boolean(refundBusyId)}
              disabled={refundDecision?.type === "reject" && !refundDecision?.note?.trim()}
              onClick={() => {
                if (!refundDecision?.item) return;
                if (refundDecision.type === "approve") {
                  void handleApproveRefund(refundDecision.item, refundDecision.note.trim());
                } else {
                  void handleRejectRefund(refundDecision.item, refundDecision.note);
                }
              }}
            >
              {refundDecision?.type === "approve" ? "Xác nhận duyệt" : "Xác nhận từ chối"}
            </Button>
          </>
        )}
      >
        {refundDecision ? (
          <div className="hotel-refund-decision">
            <dl>
              <div><dt>Khách hàng</dt><dd>{bookingCustomerName(refundBookings[String(refundDecision.item.bookingId)])}</dd></div>
              <div><dt>Khách đã trả</dt><dd>{money(refundDecision.item.totalPaidAmount)}</dd></div>
              <div><dt>Khách sạn đã thu</dt><dd>{money(refundDecision.item.hotelDirectAmount)}</dd></div>
            </dl>
            <label>
              <span>
                {refundDecision.type === "approve"
                  ? "Ghi chú duyệt (không bắt buộc)"
                  : "Lý do từ chối *"}
              </span>
              <textarea
                rows={4}
                maxLength={500}
                value={refundDecision.note}
                onChange={(event) => setRefundDecision((current) => ({
                  ...current,
                  note: event.target.value,
                }))}
                placeholder={refundDecision.type === "approve"
                  ? "Thêm ghi chú nếu cần"
                  : "Giải thích rõ lý do từ chối cho khách"}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {refundDraft ? (
        <div className="wallet-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRefundDraft(null); }}>
          <form className="wallet-withdrawal-modal refund-proof-form" onSubmit={submitRefundProof} role="dialog" aria-modal="true" aria-labelledby="hotel-refund-proof-title">
            <button className="wallet-modal-close" type="button" onClick={() => setRefundDraft(null)} aria-label="Đóng biểu mẫu chứng từ"><X size={20} /></button>
            <span className="wallet-page-kicker">HOÀN TIỀN TRỰC TIẾP</span>
            <h2 id="hotel-refund-proof-title">Đơn {refundDraft.item.bookingCode}</h2>
            <p>Chuyển đúng <strong>{money(refundDraft.item.hotelDirectAmount)}</strong> tới tài khoản khách đã cung cấp, sau đó tải chứng từ.</p>
            <div className="wallet-proof-bank">
              <Banknote size={18} />
              <div><small>Tài khoản nhận</small><strong>{refundAccountSummary(refundDraft.item)}</strong>{refundDraft.item.refundAccountName ? <span>{refundDraft.item.refundAccountName}</span> : null}</div>
            </div>
            <label>Mã giao dịch
              <input value={refundDraft.reference} onChange={(event) => setRefundDraft((current) => ({ ...current, reference: event.target.value }))} required />
            </label>
            <label className="wallet-upload-label">
              <ImageUp size={19} />
              <span>Ảnh chứng từ hoàn tiền</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setRefundDraft((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} required />
            </label>
            <button className="wallet-primary-button" type="submit" disabled={refundBusyId === refundDraft.item.id}>Xác nhận đã hoàn tiền</button>
          </form>
        </div>
      ) : null}

      {refundProofItem && refundProofUrl ? (
        <div className="wallet-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRefundProofItem(null); URL.revokeObjectURL(refundProofUrl); setRefundProofUrl(""); } }}>
          <section className="wallet-proof-modal" role="dialog" aria-modal="true" aria-labelledby="hotel-refund-proof-view-title">
            <button className="wallet-modal-close" type="button" onClick={() => { setRefundProofItem(null); URL.revokeObjectURL(refundProofUrl); setRefundProofUrl(""); }} aria-label="Đóng chứng từ hoàn tiền"><X size={20} /></button>
            <div className="wallet-proof-modal-head"><div className="wallet-proof-success-icon"><CheckCircle2 size={25} /></div><div><span className="wallet-page-kicker">CHỨNG TỪ HOÀN TIỀN</span><h3 id="hotel-refund-proof-view-title">Đã hoàn cho khách</h3><p>Đơn {refundProofItem.bookingCode} · {money(refundProofItem.hotelDirectAmount)}</p></div></div>
            <img className="wallet-proof-customer-image" src={refundProofUrl} alt="Chứng từ hoàn tiền" />
          </section>
        </div>
      ) : null}

      {historyQr && historyQrUrl ? (
        <div className="wallet-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setHistoryQr(null);
            URL.revokeObjectURL(historyQrUrl);
            setHistoryQrUrl("");
          }
        }}>
          <div className="wallet-qr-modal" role="dialog" aria-modal="true" aria-labelledby="hotel-withdrawal-qr-title">
            <h3 id="hotel-withdrawal-qr-title">QR nhận tiền đã gửi</h3>
            <p>{money(historyQr.amount)} · {dateTime(historyQr.requestedAt)}</p>
            <img src={historyQrUrl} alt="QR nhận tiền" />
            <button className="wallet-secondary-button" type="button" onClick={() => {
              setHistoryQr(null);
              URL.revokeObjectURL(historyQrUrl);
              setHistoryQrUrl("");
            }}>Đóng</button>
          </div>
        </div>
      ) : null}

      {proofWithdrawal && proofUrl ? (
        <div
          className="wallet-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTransferProof();
          }}
        >
          <section className="wallet-proof-modal" role="dialog" aria-modal="true" aria-labelledby="hotel-transfer-proof-title">
            <button
              className="wallet-modal-close"
              type="button"
              onClick={closeTransferProof}
              aria-label="Đóng"
            >
              <X size={20} />
            </button>

            <div className="wallet-proof-modal-head">
              <div className="wallet-proof-success-icon">
                <CheckCircle2 size={25} />
              </div>
              <div>
                <span className="wallet-page-kicker">CHỨNG TỪ CHUYỂN KHOẢN</span>
                <h3 id="hotel-transfer-proof-title">Đã chuyển tiền</h3>
                <p>Đây là chứng từ chuyển khoản được lưu khi yêu cầu rút tiền được hoàn tất.</p>
              </div>
            </div>

            <div className="wallet-proof-summary">
              <div><small>Số tiền đã chuyển</small><strong>{money(proofWithdrawal.amount)}</strong></div>
              <div><small>Trạng thái</small><StatusBadge status={proofWithdrawal.status} label={withdrawalStatusLabel(proofWithdrawal.status)} size="sm" /></div>
              <div><small>Mã giao dịch</small><strong>{proofWithdrawal.payoutReference || "—"}</strong></div>
              <div><small>Thời gian chuyển</small><strong>{dateTime(proofWithdrawal.paidAt)}</strong></div>
            </div>

            {proofWithdrawal.bankName ? (
              <div className="wallet-proof-bank">
                <Banknote size={18} />
                <div>
                  <small>Tiền được chuyển tới</small>
                  <strong>
                    {proofWithdrawal.bankName}
                    {proofWithdrawal.accountNumber ? ` · ${proofWithdrawal.accountNumber}` : ""}
                  </strong>
                  <span>{proofWithdrawal.accountName || ""}</span>
                </div>
              </div>
            ) : null}

            <div className="wallet-proof-image-wrap">
              <div className="wallet-real-section-title">
                <FileImage size={19} />
                <strong>Ảnh chứng từ chuyển khoản</strong>
              </div>
              <img
                className="wallet-proof-customer-image"
                src={proofUrl}
                alt="Chứng từ chuyển khoản"
              />
            </div>

            <div className="wallet-proof-modal-footer">
              <span><CheckCircle2 size={16} /> Chứng từ được lưu để hai bên đối soát.</span>
              <button className="wallet-secondary-button" type="button" onClick={closeTransferProof}>Đóng</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
