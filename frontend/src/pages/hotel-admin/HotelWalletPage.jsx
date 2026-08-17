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
import "../shared/WalletPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const INITIAL_FORM = {
  amount: "",
  payoutMethod: "BANK_ACCOUNT",
  bankName: "ACB",
  bankBin: "970416",
  accountNumber: "",
  accountName: "",
};

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
  return labels[type] ?? type;
}

function refundReasonLabel(value) {
  return ({
    PERSONAL_ISSUE: "Sự cố cá nhân",
    HOTEL_AGREED: "Khách sạn đồng ý hoàn",
    CANNOT_ARRIVE: "Không thể đến nhận phòng",
    DUPLICATE_PAYMENT: "Thanh toán trùng",
    OTHER: "Lý do khác",
  }[value] ?? value ?? "Chưa có lý do");
}

function withdrawalStatusLabel(value) {
  return ({
    PENDING: "Chờ xử lý",
    PROCESSING: "Đang xử lý",
    PAID: "Đã chuyển tiền",
    REJECTED: "Đã từ chối",
    FAILED: "Xử lý thất bại",
    CANCELLED: "Đã hủy",
  }[value] ?? value);
}

function payoutMethodLabel(value) {
  if (value === "PERSONAL_QR") return "QR cá nhân";
  if (value === "BANK_AND_QR") return "Ngân hàng + QR cá nhân";
  return "Tài khoản ngân hàng";
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
  const [refundBusyId, setRefundBusyId] = useState("");
  const [refundDraft, setRefundDraft] = useState(null);
  const [refundProofItem, setRefundProofItem] = useState(null);
  const [refundProofUrl, setRefundProofUrl] = useState("");

  const needBank = ["BANK_ACCOUNT", "BANK_AND_QR"].includes(form.payoutMethod);
  const needQr = ["PERSONAL_QR", "BANK_AND_QR"].includes(form.payoutMethod);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, transactionData, withdrawalData, refundData] = await Promise.all([
        getMyWallet(),
        getMyWalletTransactions(),
        getMyWithdrawals(),
        getHotelRefundRequests().catch(() => []),
      ]);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
      setRefundRequests(Array.isArray(refundData) ? refundData : []);
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

  async function handleApproveRefund(item) {
    const note = window.prompt(
      "Ghi chú duyệt hoàn tiền (có thể để trống):",
      item.policyCode === "NO_SHOW_REVIEW"
        ? "Duyệt ngoại lệ cho booking không đến nhận phòng."
        : "Đồng ý hoàn tiền theo yêu cầu của khách.",
    );
    if (note === null) return;
    setRefundBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await approveRefundRequest(item.id, note);
      setMessage("Đã duyệt yêu cầu hoàn tiền. Các phần tiền sẽ được xử lý đúng theo nơi đang giữ tiền.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể duyệt yêu cầu hoàn tiền.");
    } finally {
      setRefundBusyId("");
    }
  }

  async function handleRejectRefund(item) {
    const note = window.prompt("Nhập lý do từ chối hoàn tiền:", "Không đáp ứng chính sách hoàn tiền/no-show của khách sạn.");
    if (note === null || !note.trim()) return;
    setRefundBusyId(item.id);
    setError("");
    try {
      await rejectRefundRequest(item.id, note.trim());
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
    }[value] ?? value);
  }

  const cards = useMemo(() => [
    ["Số dư khả dụng", wallet?.availableBalance, WalletCards],
    ["Doanh thu đang giữ", wallet?.pendingBalance, Clock3],
    ["Công nợ hoa hồng", wallet?.commissionDebt, ShieldAlert],
    ["Đang chờ rút", wallet?.lockedBalance, LockKeyhole],
    ["Tổng đã rút", wallet?.totalWithdrawn, ArrowDownToLine],
  ], [wallet]);

  return (
    <div className="wallet-page hotel-wallet-page">
      <header className="wallet-page-heading">
        <div>
          <span className="wallet-page-kicker">TÀI CHÍNH</span>
          <h1>Ví & đối soát khách sạn</h1>
          <p>
            Một nơi để theo dõi tiền đang có, tiền đang giữ, yêu cầu hoàn của khách và lịch sử rút tiền.
            Các khoản hoàn của booking “Không đến” được tách theo đúng nơi đang giữ tiền.
          </p>
        </div>
        <button className="wallet-refresh-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={18} className={loading ? "spin" : ""} /> Làm mới
        </button>
      </header>

      {error ? <div className="wallet-error">{error}</div> : null}
      {message ? <div className="wallet-message">{message}</div> : null}

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
                    <td>{dateTime(item.createdAt)}</td>
                    <td><strong>{transactionLabel(item.type)}</strong><br /><small>{item.description}</small></td>
                    <td>{item.paymentId ?? item.paymentOrderId ?? item.withdrawalId ?? "—"}</td>
                    <td className={Number(item.amount) >= 0 ? "wallet-money-positive" : "wallet-money-negative"}>
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
                      <input name="bankName" value={form.bankName} onChange={handleChange} placeholder="Ví dụ: ACB" required />
                    </label>
                    <label>Mã BIN
                      <input name="bankBin" inputMode="numeric" maxLength="6" value={form.bankBin} onChange={handleChange} required />
                    </label>
                  </div>
                  <label>Số tài khoản
                    <input name="accountNumber" inputMode="numeric" value={form.accountNumber} onChange={handleChange} required />
                  </label>
                  <label>Tên chủ tài khoản
                    <input name="accountName" value={form.accountName} onChange={handleChange} placeholder="NGUYEN VAN A" required />
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
          <span>{refundRequests.length} yêu cầu</span>
        </div>
        <div className="wallet-helper wallet-helper-real">
          Booking “Không đến” không tự động được hoàn. Nếu bạn duyệt: phần EnziuRooms đang giữ sẽ do System Admin xử lý; phần khách sạn đã thu trực tiếp phải được khách sạn hoàn và tải chứng từ.
        </div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Booking</th><th>Khách đã trả</th><th>Phân luồng hoàn</th><th>Chính sách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {refundRequests.map((item) => (
                <tr key={`hotel-refund-${item.id}`}>
                  <td><strong>{item.bookingCode}</strong><br /><small>{dateTime(item.requestedAt)}</small></td>
                  <td><strong>{money(item.totalPaidAmount)}</strong><br /><small>{refundReasonLabel(item.reasonCode)}</small></td>
                  <td>
                    <small>EnziuRooms: <strong>{money(item.platformHeldAmount)}</strong></small><br />
                    <small>Khách sạn: <strong>{money(item.hotelDirectAmount)}</strong></small>
                    {Number(item.manualReconciliationAmount ?? 0) > 0 ? <><br /><small>Đối soát: <strong>{money(item.manualReconciliationAmount)}</strong></small></> : null}
                  </td>
                  <td><small>{item.policyMessage}</small></td>
                  <td><span className={`wallet-status ${String(item.status).toLowerCase()}`}>{refundStatusLabel(item.status)}</span></td>
                  <td>
                    <div className="wallet-actions">
                      {item.status === "PENDING_HOTEL_REVIEW" ? (
                        <>
                          <button className="primary" type="button" disabled={refundBusyId === item.id} onClick={() => void handleApproveRefund(item)}>Duyệt</button>
                          <button className="danger" type="button" disabled={refundBusyId === item.id} onClick={() => void handleRejectRefund(item)}>Từ chối</button>
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
                      <div className="refund-bank-mini">{item.refundBankName} · {item.refundAccountNumber}<br />{item.refundAccountName}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && refundRequests.length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">Chưa có yêu cầu hoàn tiền từ khách.</td></tr>
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
                  <td>{dateTime(item.requestedAt)}</td>
                  <td>
                    <strong>{payoutMethodLabel(item.payoutMethod)}</strong>
                    {item.bankName ? <><br /><small>{item.bankName} · {item.accountNumber} · {item.accountName}</small></> : null}
                    {item.receiverQrAvailable ? (
                      <><br /><button className="wallet-inline-link" type="button" onClick={() => openHistoryQr(item)}>Xem QR đã gửi</button></>
                    ) : null}
                  </td>
                  <td>{money(item.amount)}</td>
                  <td><span className={`wallet-status ${String(item.status).toLowerCase()}`}>{withdrawalStatusLabel(item.status)}</span></td>
                  <td>
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

      {refundDraft ? (
        <div className="wallet-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRefundDraft(null); }}>
          <form className="wallet-withdrawal-modal refund-proof-form" onSubmit={submitRefundProof}>
            <button className="wallet-modal-close" type="button" onClick={() => setRefundDraft(null)}><X size={20} /></button>
            <span className="wallet-page-kicker">HOÀN TIỀN TRỰC TIẾP</span>
            <h2>Booking {refundDraft.item.bookingCode}</h2>
            <p>Chuyển đúng <strong>{money(refundDraft.item.hotelDirectAmount)}</strong> tới tài khoản khách đã cung cấp, sau đó tải chứng từ.</p>
            <div className="wallet-proof-bank">
              <Banknote size={18} />
              <div><small>Tài khoản nhận</small><strong>{refundDraft.item.refundBankName} · {refundDraft.item.refundAccountNumber}</strong><span>{refundDraft.item.refundAccountName}</span></div>
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
        <div className="wallet-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRefundProofItem(null); URL.revokeObjectURL(refundProofUrl); setRefundProofUrl(""); } }}>
          <section className="wallet-proof-modal">
            <button className="wallet-modal-close" type="button" onClick={() => { setRefundProofItem(null); URL.revokeObjectURL(refundProofUrl); setRefundProofUrl(""); }}><X size={20} /></button>
            <div className="wallet-proof-modal-head"><div className="wallet-proof-success-icon"><CheckCircle2 size={25} /></div><div><span className="wallet-page-kicker">CHỨNG TỪ HOÀN TIỀN</span><h3>Đã hoàn cho khách</h3><p>Booking {refundProofItem.bookingCode} · {money(refundProofItem.hotelDirectAmount)}</p></div></div>
            <img className="wallet-proof-customer-image" src={refundProofUrl} alt="Chứng từ hoàn tiền" />
          </section>
        </div>
      ) : null}

      {historyQr && historyQrUrl ? (
        <div className="wallet-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setHistoryQr(null);
            URL.revokeObjectURL(historyQrUrl);
            setHistoryQrUrl("");
          }
        }}>
          <div className="wallet-qr-modal">
            <h3>QR nhận tiền đã gửi</h3>
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
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTransferProof();
          }}
        >
          <section className="wallet-proof-modal">
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
                <h3>Đã chuyển tiền</h3>
                <p>Đây là chứng từ chuyển khoản được lưu khi yêu cầu rút tiền được hoàn tất.</p>
              </div>
            </div>

            <div className="wallet-proof-summary">
              <div><small>Số tiền đã chuyển</small><strong>{money(proofWithdrawal.amount)}</strong></div>
              <div><small>Trạng thái</small><span className={`wallet-status ${String(proofWithdrawal.status).toLowerCase()}`}>{withdrawalStatusLabel(proofWithdrawal.status)}</span></div>
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
    </div>
  );
}