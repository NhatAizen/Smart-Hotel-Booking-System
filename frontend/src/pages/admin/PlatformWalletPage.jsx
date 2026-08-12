import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCopy,
  Clock3,
  HandCoins,
  ImageUp,
  QrCode,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveWithdrawal,
  getPlatformWallet,
  getPlatformWalletTransactions,
  getPaymentsByStatus,
  getWithdrawalReceiverQr,
  getWithdrawalTransferProof,
  getWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
  refundPaymentToWallet,
  releaseHotelRevenue,
} from "../../services/paymentService";
import "../shared/WalletPage.css";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function payoutMethodLabel(value) {
  if (value === "PERSONAL_QR") return "QR cá nhân";
  if (value === "BANK_AND_QR") return "Ngân hàng + QR cá nhân";
  return "Tài khoản ngân hàng";
}

export default function PlatformWalletPage() {
  const withdrawalDocumentsRequestRef = useRef(0);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [paidPayments, setPaidPayments] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [receiverQrUrl, setReceiverQrUrl] = useState("");
  const [savedProofUrl, setSavedProofUrl] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferProof, setTransferProof] = useState(null);
  const [transferProofPreview, setTransferProofPreview] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, transactionData, withdrawalData, paymentData] = await Promise.all([
        getPlatformWallet(),
        getPlatformWalletTransactions(),
        getWithdrawals(status),
        getPaymentsByStatus("PAID"),
      ]);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
      setPaidPayments(Array.isArray(paymentData) ? paymentData : []);
      setSelectedWithdrawal((current) => {
        if (!current) return current;
        return (Array.isArray(withdrawalData) ? withdrawalData : []).find(
          (item) => item.id === current.id,
        ) ?? current;
      });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải dữ liệu tài chính nền tảng.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!transferProof) {
      setTransferProofPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(transferProof);
    setTransferProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [transferProof]);

  useEffect(() => () => {
    if (receiverQrUrl) URL.revokeObjectURL(receiverQrUrl);
    if (savedProofUrl) URL.revokeObjectURL(savedProofUrl);
  }, [receiverQrUrl, savedProofUrl]);

  async function run(id, action, successMessage) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể xử lý yêu cầu.");
    } finally {
      setBusyId("");
    }
  }

  async function openWithdrawal(item) {
    const requestId = withdrawalDocumentsRequestRef.current + 1;
    withdrawalDocumentsRequestRef.current = requestId;
    setSelectedWithdrawal(item);
    setTransferReference(item.payoutReference ?? "");
    setTransferProof(null);
    setError("");
    if (receiverQrUrl) URL.revokeObjectURL(receiverQrUrl);
    if (savedProofUrl) URL.revokeObjectURL(savedProofUrl);
    setReceiverQrUrl("");
    setSavedProofUrl("");

    try {
      if (item.receiverQrAvailable) {
        const blob = await getWithdrawalReceiverQr(item.id);
        if (withdrawalDocumentsRequestRef.current !== requestId) return;
        setReceiverQrUrl(URL.createObjectURL(blob));
      }
      if (item.transferProofAvailable) {
        const blob = await getWithdrawalTransferProof(item.id);
        if (withdrawalDocumentsRequestRef.current !== requestId) return;
        setSavedProofUrl(URL.createObjectURL(blob));
      }
    } catch (requestError) {
      if (withdrawalDocumentsRequestRef.current === requestId) {
        setError(requestError.response?.data?.message ?? "Không thể tải tài liệu rút tiền.");
      }
    }
  }

  function closeWithdrawal() {
    withdrawalDocumentsRequestRef.current += 1;
    setSelectedWithdrawal(null);
    setTransferReference("");
    setTransferProof(null);
    if (receiverQrUrl) URL.revokeObjectURL(receiverQrUrl);
    if (savedProofUrl) URL.revokeObjectURL(savedProofUrl);
    setReceiverQrUrl("");
    setSavedProofUrl("");
  }

  async function handleApproveReal(item) {
    const note = window.prompt(
      "Ghi chú duyệt (có thể để trống):",
      "Đã kiểm tra thông tin nhận tiền. Chờ System Admin chuyển khoản thật.",
    );
    if (note === null) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const updated = await approveWithdrawal(item.id, note, false);
      setSelectedWithdrawal((current) => current?.id === item.id ? { ...current, ...updated } : current);
      setMessage("Đã duyệt. Hãy chuyển tiền thật bằng app ngân hàng, sau đó tải chứng từ để hoàn tất.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể duyệt yêu cầu rút tiền.");
    } finally {
      setBusyId("");
    }
  }

  function handleReject(item) {
    const note = window.prompt("Nhập lý do từ chối:", "Thông tin nhận tiền chưa hợp lệ");
    if (note === null) return undefined;
    return run(item.id, () => rejectWithdrawal(item.id, note), "Đã từ chối và hoàn số dư cho chủ ví.");
  }

  async function handleMarkPaidReal(event) {
    event.preventDefault();
    const item = selectedWithdrawal;
    if (!item) return;
    if (!transferReference.trim()) {
      setError("Nhập mã giao dịch/chứng từ từ ứng dụng ngân hàng.");
      return;
    }
    if (!transferProof) {
      setError("Bắt buộc tải ảnh chứng từ chuyển khoản thật trước khi xác nhận đã trả.");
      return;
    }
    if (!window.confirm(`Xác nhận bạn đã CHUYỂN TIỀN THẬT ${money(item.amount)} cho người nhận này?`)) return;

    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const updated = await markWithdrawalPaid(item.id, transferReference.trim(), transferProof);
      setSelectedWithdrawal((current) => current?.id === item.id ? { ...current, ...updated } : current);
      setMessage("Đã ghi nhận chuyển tiền thật. Tiền khóa đã được trừ khỏi ví và chứng từ được lưu.");
      setTransferProof(null);
      const blob = await getWithdrawalTransferProof(item.id);
      if (savedProofUrl) URL.revokeObjectURL(savedProofUrl);
      setSavedProofUrl(URL.createObjectURL(blob));
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể xác nhận chuyển tiền.");
    } finally {
      setBusyId("");
    }
  }

  function handleRefund(item) {
    if (!window.confirm(
      `Hoàn ${money(item.amount)} của booking ${item.bookingId} vào Ví Enziu của khách?`,
    )) return undefined;
    return run(
      item.id,
      () => refundPaymentToWallet(item.id),
      "Đã hoàn tiền vào Ví Enziu của khách và đảo doanh thu/hoa hồng tương ứng.",
    );
  }

  async function copyText(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setMessage("Đã sao chép thông tin nhận tiền.");
    } catch {
      setError("Không thể sao chép tự động. Hãy chọn và copy thủ công.");
    }
  }

  const cards = [
    ["Hoa hồng khả dụng", wallet?.availableBalance, BadgeDollarSign],
    ["Tổng hoa hồng", wallet?.totalEarned, CircleDollarSign],
    ["Đang giữ", wallet?.pendingBalance, Clock3],
    ["Số yêu cầu rút", withdrawals.length, HandCoins, true],
  ];

  return (
    <div className="wallet-page">
      <header className="wallet-page-heading">
        <div>
          <span className="wallet-page-kicker">TÀI CHÍNH HỆ THỐNG</span>
          <h1>Ví EnziuRooms & đối soát</h1>
          <p>
            Yêu cầu rút tiền được xử lý theo luồng chuyển khoản thật: kiểm tra tài khoản/QR → duyệt → chuyển bằng ngân hàng → lưu chứng từ → xác nhận đã trả.
          </p>
        </div>
        <button className="wallet-refresh-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={18} className={loading ? "spin" : ""} /> Làm mới
        </button>
      </header>

      {error ? <div className="wallet-error">{error}</div> : null}
      {message ? <div className="wallet-message">{message}</div> : null}

      <section className="wallet-balance-grid">
        {cards.map(([label, value, Icon, plain]) => (
          <article className="wallet-balance-card" key={label}>
            <div className="icon"><Icon size={21} /></div>
            <div><small>{label}</small><strong>{plain ? Number(value ?? 0).toLocaleString("vi-VN") : money(value)}</strong></div>
          </article>
        ))}
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header">
          <h2><Banknote size={18} /> Yêu cầu rút tiền thật</h2>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt - chờ chuyển thật</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="PAID">Đã chuyển thật</option>
            <option value="REJECTED">Từ chối</option>
            <option value="FAILED">Xử lý lỗi</option>
          </select>
        </div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Chủ ví</th><th>Nhận tiền bằng</th><th>Số tiền</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
            <tbody>
              {withdrawals.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.ownerType === "CUSTOMER" ? "Customer" : "Hotel Admin"}</strong>
                    <br /><small>{item.ownerId ?? item.hotelOwnerId}</small>
                  </td>
                  <td>
                    <strong>{payoutMethodLabel(item.payoutMethod)}</strong>
                    {item.bankName ? <><br /><small>{item.bankName} · {item.accountNumber} · {item.accountName}</small></> : null}
                    {item.receiverQrAvailable ? <><br /><small>✓ Có QR cá nhân</small></> : null}
                  </td>
                  <td><strong>{money(item.amount)}</strong></td>
                  <td><span className={`wallet-status ${String(item.status).toLowerCase()}`}>{item.status}</span></td>
                  <td>{dateTime(item.requestedAt)}</td>
                  <td>
                    <div className="wallet-actions">
                      <button className="primary" type="button" disabled={busyId === item.id} onClick={() => openWithdrawal(item)}>
                        {item.status === "PAID" ? "Xem chứng từ" : "Xem & xử lý"}
                      </button>
                      {item.status === "PENDING" ? (
                        <button className="danger" type="button" disabled={busyId === item.id} onClick={() => handleReject(item)}>Từ chối</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && withdrawals.length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">Không có yêu cầu rút tiền phù hợp.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header">
          <h2><CircleDollarSign size={18} /> Hoàn tiền vào Ví Enziu</h2>
          <span>{paidPayments.length} giao dịch có thể kiểm tra</span>
        </div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Booking</th><th>Phương thức</th><th>Đã thu</th><th>Hoa hồng</th><th>Hotel net</th><th>Thao tác</th></tr></thead>
            <tbody>
              {paidPayments.map((item) => (
                <tr key={`refund-${item.id}`}>
                  <td><strong>{item.bookingId}</strong><br /><small>{dateTime(item.paidAt)}</small></td>
                  <td>{item.method}</td>
                  <td>{money(item.amount)}</td>
                  <td>{money(item.commissionAmount)}</td>
                  <td>{money(item.hotelNetAmount)}</td>
                  <td>
                    <button className="wallet-danger-button" type="button" disabled={busyId === item.id} onClick={() => handleRefund(item)}>
                      Hoàn vào ví khách
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && paidPayments.length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">Không có giao dịch PAID để hoàn.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header">
          <h2><Clock3 size={18} /> Doanh thu khách sạn đang giữ</h2>
          <span>{paidPayments.filter((item) => item.walletApplied && !item.revenueReleased).length} khoản</span>
        </div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Booking</th><th>Hotel Admin</th><th>Đã thu</th><th>Hoa hồng</th><th>Khách sạn nhận</th><th>Thao tác</th></tr></thead>
            <tbody>
              {paidPayments.filter((item) => item.walletApplied && !item.revenueReleased).map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.bookingId}</strong><br /><small>{dateTime(item.paidAt)}</small></td>
                  <td>{item.hotelOwnerId}</td>
                  <td>{money(item.amount)}</td>
                  <td>{money(item.commissionAmount)}</td>
                  <td><strong>{money(item.hotelNetAmount)}</strong></td>
                  <td>
                    <button className="primary" type="button" disabled={busyId === item.id} onClick={() => run(
                      item.id,
                      () => releaseHotelRevenue(item.id),
                      "Đã chuyển doanh thu từ số dư đang giữ sang số dư khả dụng của Hotel Admin.",
                    )}>Giải ngân</button>
                  </td>
                </tr>
              ))}
              {!loading && paidPayments.filter((item) => item.walletApplied && !item.revenueReleased).length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">Không có doanh thu khách sạn đang chờ giải ngân.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header"><h2><WalletCards size={18} /> Lịch sử hoa hồng</h2><span>{transactions.length} giao dịch</span></div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Thời gian</th><th>Loại</th><th>Nội dung</th><th>Số tiền</th></tr></thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.createdAt)}</td>
                  <td><strong>{item.type}</strong></td>
                  <td>{item.description}</td>
                  <td className={Number(item.amount) >= 0 ? "wallet-money-positive" : "wallet-money-negative"}>
                    {Number(item.amount) > 0 ? "+" : ""}{money(item.amount)}
                  </td>
                </tr>
              ))}
              {!loading && transactions.length === 0 ? (
                <tr><td colSpan="4" className="wallet-empty">Chưa có hoa hồng được ghi nhận.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedWithdrawal ? (
        <div className="wallet-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWithdrawal();
        }}>
          <section className="wallet-withdrawal-modal">
            <button className="wallet-modal-close" type="button" onClick={closeWithdrawal}><X size={20} /></button>
            <div className="wallet-withdrawal-modal-head">
              <span className="wallet-page-kicker">REAL WITHDRAWAL REVIEW</span>
              <h2>Chuyển tiền thật cho yêu cầu rút</h2>
              <p>
                Không đánh dấu hoàn tất trước khi bạn đã chuyển tiền bằng ứng dụng ngân hàng và có chứng từ thật.
              </p>
            </div>

            <div className="wallet-real-summary">
              <div><small>Số tiền phải chuyển</small><strong>{money(selectedWithdrawal.amount)}</strong></div>
              <div><small>Chủ ví</small><strong>{selectedWithdrawal.ownerType === "CUSTOMER" ? "Customer" : "Hotel Admin"}</strong><span>{selectedWithdrawal.ownerId}</span></div>
              <div><small>Phương thức</small><strong>{payoutMethodLabel(selectedWithdrawal.payoutMethod)}</strong></div>
              <div><small>Trạng thái</small><span className={`wallet-status ${String(selectedWithdrawal.status).toLowerCase()}`}>{selectedWithdrawal.status}</span></div>
            </div>

            {selectedWithdrawal.bankName ? (
              <div className="wallet-real-destination">
                <div className="wallet-real-section-title"><Banknote size={19} /><strong>Tài khoản ngân hàng nhận tiền</strong></div>
                <div className="wallet-bank-detail-grid">
                  <div><small>Ngân hàng</small><strong>{selectedWithdrawal.bankName}</strong></div>
                  <div><small>BIN</small><strong>{selectedWithdrawal.bankBin}</strong></div>
                  <div className="wide"><small>Số tài khoản</small><strong>{selectedWithdrawal.accountNumber}</strong><button type="button" onClick={() => copyText(selectedWithdrawal.accountNumber)}><ClipboardCopy size={15} /> Sao chép</button></div>
                  <div className="wide"><small>Chủ tài khoản</small><strong>{selectedWithdrawal.accountName}</strong><button type="button" onClick={() => copyText(selectedWithdrawal.accountName)}><ClipboardCopy size={15} /> Sao chép</button></div>
                </div>
              </div>
            ) : null}

            {selectedWithdrawal.receiverQrAvailable ? (
              <div className="wallet-real-destination">
                <div className="wallet-real-section-title"><QrCode size={19} /><strong>QR cá nhân do người nhận tải lên</strong></div>
                {receiverQrUrl ? (
                  <div className="wallet-admin-qr-box">
                    <img src={receiverQrUrl} alt="QR nhận tiền thật" />
                    <p>Mở app ngân hàng của System Admin và quét QR này. Kiểm tra lại tên người nhận và số tiền trước khi chuyển.</p>
                  </div>
                ) : <p>Đang tải QR...</p>}
              </div>
            ) : null}

            {selectedWithdrawal.status === "PENDING" ? (
              <div className="wallet-real-approval-box">
                <ShieldCheck size={22} />
                <div>
                  <strong>Bước 1 · Duyệt thông tin nhận tiền</strong>
                  <p>Duyệt chỉ xác nhận thông tin hợp lệ, chưa trừ tiền khóa và chưa được coi là đã chuyển.</p>
                </div>
                <button className="wallet-primary-button" type="button" disabled={busyId === selectedWithdrawal.id} onClick={() => handleApproveReal(selectedWithdrawal)}>
                  Duyệt để chuyển tiền
                </button>
              </div>
            ) : null}

            {["APPROVED", "PROCESSING"].includes(selectedWithdrawal.status) ? (
              <form className="wallet-real-transfer-form" onSubmit={handleMarkPaidReal}>
                <div className="wallet-real-section-title"><CheckCircle2 size={19} /><strong>Bước 2 · Sau khi đã chuyển tiền thật</strong></div>
                <div className="wallet-helper wallet-helper-real">
                  Chuyển đúng <strong>{money(selectedWithdrawal.amount)}</strong> bằng app ngân hàng. Sau đó nhập mã giao dịch và tải ảnh biên lai/chứng từ. Hệ thống bắt buộc có chứng từ mới cho đánh dấu PAID.
                </div>
                <label>Mã giao dịch / mã tham chiếu ngân hàng
                  <input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder="Ví dụ: FT260811123456" required />
                </label>
                <label className="wallet-upload-label wallet-proof-upload">
                  <ImageUp size={19} />
                  <span>Ảnh chứng từ chuyển khoản thật</span>
                  <small>PNG/JPG/WEBP · tối đa 5MB</small>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setTransferProof(event.target.files?.[0] ?? null)} required />
                </label>
                {transferProofPreview ? <img className="wallet-proof-preview" src={transferProofPreview} alt="Chứng từ sắp gửi" /> : null}
                <button className="wallet-primary-button wallet-real-paid-button" type="submit" disabled={busyId === selectedWithdrawal.id}>
                  <CheckCircle2 size={18} /> Tôi đã chuyển tiền thật · Xác nhận PAID
                </button>
              </form>
            ) : null}

            {selectedWithdrawal.status === "PAID" ? (
              <div className="wallet-paid-proof-panel">
                <CheckCircle2 size={28} />
                <div>
                  <strong>Đã chuyển tiền thật</strong>
                  <p>Mã giao dịch: {selectedWithdrawal.payoutReference || "—"}</p>
                  <p>Thời gian: {dateTime(selectedWithdrawal.paidAt)}</p>
                </div>
                {savedProofUrl ? <img src={savedProofUrl} alt="Chứng từ chuyển khoản đã lưu" /> : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
