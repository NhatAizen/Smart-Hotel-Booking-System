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
} from "../../services/paymentService";
import "../shared/WalletPage.css";

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

  const needBank = ["BANK_ACCOUNT", "BANK_AND_QR"].includes(form.payoutMethod);
  const needQr = ["PERSONAL_QR", "BANK_AND_QR"].includes(form.payoutMethod);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, transactionData, withdrawalData] = await Promise.all([
        getMyWallet(),
        getMyWalletTransactions(),
        getMyWithdrawals(),
      ]);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải ví khách sạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
  }, [historyQrUrl, proofUrl]);

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
        "Đã gửi yêu cầu rút tiền thật. Số tiền đã được khóa; System Admin sẽ dùng đúng tài khoản/QR này để chuyển tiền và phải tải chứng từ trước khi xác nhận đã trả.",
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
          ?? "Không thể tải chứng từ chuyển khoản của System Admin.",
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
          <span className="wallet-page-kicker">TÀI CHÍNH ĐỐI TÁC</span>
          <h1>Ví khách sạn</h1>
          <p>
            Doanh thu online được giữ để bảo đảm hoàn tiền và tự giải ngân sau checkout.
            Khi rút tiền, bạn cung cấp tài khoản ngân hàng thật hoặc QR nhận tiền thật để System Admin chuyển khoản.
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
            <h2><History size={18} /> Lịch sử ví</h2>
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
            <div className="wallet-panel-header"><h2><Banknote size={18} /> Yêu cầu rút tiền thật</h2></div>
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
                    <label>Ngân hàng thật
                      <input name="bankName" value={form.bankName} onChange={handleChange} placeholder="Ví dụ: ACB" required />
                    </label>
                    <label>Mã BIN
                      <input name="bankBin" inputMode="numeric" maxLength="6" value={form.bankBin} onChange={handleChange} required />
                    </label>
                  </div>
                  <label>Số tài khoản thật
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
                <strong>Luồng tiền thật:</strong> System Admin sẽ mở đúng thông tin/QR bạn gửi, chuyển tiền bằng ứng dụng ngân hàng thật, sau đó bắt buộc nhập mã giao dịch và tải ảnh chứng từ. Chỉ lúc đó yêu cầu mới được đánh dấu Đã chuyển.
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
                  <td><span className={`wallet-status ${String(item.status).toLowerCase()}`}>{item.status}</span></td>
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
                          : "Chứng từ sẽ xuất hiện sau khi System Admin chuyển tiền."}
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
                <span className="wallet-page-kicker">PAYOUT RECEIPT</span>
                <h3>System Admin đã chuyển tiền</h3>
                <p>Đây là chứng từ chuyển khoản được lưu khi yêu cầu rút tiền được hoàn tất.</p>
              </div>
            </div>

            <div className="wallet-proof-summary">
              <div><small>Số tiền đã chuyển</small><strong>{money(proofWithdrawal.amount)}</strong></div>
              <div><small>Trạng thái</small><span className={`wallet-status ${String(proofWithdrawal.status).toLowerCase()}`}>{proofWithdrawal.status}</span></div>
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
                alt="Chứng từ chuyển khoản của System Admin"
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