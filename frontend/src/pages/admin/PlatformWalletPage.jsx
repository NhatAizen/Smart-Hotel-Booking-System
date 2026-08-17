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
  releaseHotelRevenue,
  getAdminRefundRequests,
  executePlatformRefund,
  markManualRefundResolved,
  getRefundHotelProof,
} from "../../services/paymentService";
import "../shared/WalletPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

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
  const [refundRequests, setRefundRequests] = useState([]);
  const [refundProofItem, setRefundProofItem] = useState(null);
  const [refundProofUrl, setRefundProofUrl] = useState("");
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
      const [walletData, transactionData, withdrawalData, paymentData, refundData] = await Promise.all([
        getPlatformWallet(),
        getPlatformWalletTransactions(),
        getWithdrawals(status),
        getPaymentsByStatus("PAID"),
        getAdminRefundRequests().catch(() => []),
      ]);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
      setPaidPayments(Array.isArray(paymentData) ? paymentData : []);
      setRefundRequests(Array.isArray(refundData) ? refundData : []);
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

  useRealtimeRefresh("NOTIFICATION_CREATED", load, { debounceMs: 120 });

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
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
  }, [receiverQrUrl, savedProofUrl, refundProofUrl]);

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
      "Đã kiểm tra thông tin nhận tiền. Chờ chuyển khoản.",
    );
    if (note === null) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const updated = await approveWithdrawal(item.id, note, false);
      setSelectedWithdrawal((current) => current?.id === item.id ? { ...current, ...updated } : current);
      setMessage("Đã duyệt. Hãy chuyển khoản theo thông tin nhận tiền, sau đó tải chứng từ để hoàn tất.");
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
      setError("Vui lòng tải ảnh chứng từ chuyển khoản trước khi xác nhận đã trả.");
      return;
    }
    if (!window.confirm(`Xác nhận đã chuyển ${money(item.amount)} cho người nhận này?`)) return;

    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const updated = await markWithdrawalPaid(item.id, transferReference.trim(), transferProof);
      setSelectedWithdrawal((current) => current?.id === item.id ? { ...current, ...updated } : current);
      setMessage("Đã ghi nhận chuyển khoản. Số tiền đã được trừ khỏi phần đang giữ và chứng từ đã được lưu.");
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

  function refundStatusLabel(value) {
    return ({
      PENDING_HOTEL_REVIEW: "Chờ khách sạn duyệt",
      APPROVED: "Đã duyệt",
      PARTIALLY_COMPLETED: "Đã hoàn một phần",
      COMPLETED: "Hoàn tất",
      REJECTED: "Từ chối",
    }[value] ?? value);
  }

  async function handleExecutePlatformRefund(item) {
    if (!window.confirm(`Hoàn ${money(item.platformHeldAmount)} phần EnziuRooms đang giữ cho booking ${item.bookingCode}?`)) return;
    await run(
      item.id,
      () => executePlatformRefund(item.id),
      "Đã hoàn phần tiền EnziuRooms đang giữ vào Ví Enziu của khách.",
    );
  }

  async function handleManualResolved(item) {
    const note = window.prompt(
      "Ghi nội dung đối soát khoản đã giải ngân/không thể hoàn tự động:",
      "Đã đối soát thủ công với khách sạn và khách hàng.",
    );
    if (note === null || !note.trim()) return;
    await run(
      item.id,
      () => markManualRefundResolved(item.id, note.trim()),
      "Đã ghi nhận hoàn tất phần đối soát thủ công.",
    );
  }

  async function openRefundHotelProof(item) {
    setBusyId(item.id);
    setError("");
    try {
      const blob = await getRefundHotelProof(item.id);
      if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
      setRefundProofUrl(URL.createObjectURL(blob));
      setRefundProofItem(item);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải chứng từ khách sạn hoàn tiền.");
    } finally {
      setBusyId("");
    }
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
          <span className="wallet-page-kicker">TÀI CHÍNH</span>
          <h1>Ví EnziuRooms & đối soát</h1>
          <p>
            Theo dõi số dư, đối soát và xử lý các yêu cầu rút tiền.
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
          <h2><Banknote size={18} /> Yêu cầu rút tiền</h2>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt - chờ chuyển khoản</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="PAID">Đã chuyển</option>
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
                    <strong>{item.ownerType === "CUSTOMER" ? "Khách hàng" : "Đối tác"}</strong>
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

      <section className="wallet-panel refund-workflow-panel">
        <div className="wallet-panel-header">
          <h2><CircleDollarSign size={18} /> Yêu cầu hoàn tiền đã qua khách sạn</h2>
          <span>{refundRequests.length} yêu cầu</span>
        </div>
        <div className="wallet-helper wallet-helper-real">
          System Admin chỉ hoàn phần tiền EnziuRooms còn đang giữ. Tiền mặt khách sạn đã thu phải do khách sạn hoàn trực tiếp kèm chứng từ; khoản đã giải ngân cần đối soát thủ công.
        </div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Booking</th><th>Đã thanh toán</th><th>EnziuRooms giữ</th><th>Hotel trực tiếp</th><th>Đối soát</th><th>Trạng thái / thao tác</th></tr></thead>
            <tbody>
              {refundRequests.map((item) => (
                <tr key={`refund-request-${item.id}`}>
                  <td><strong>{item.bookingCode}</strong><br /><small>{dateTime(item.requestedAt)}</small></td>
                  <td>{money(item.totalPaidAmount)}</td>
                  <td><strong>{money(item.platformHeldAmount)}</strong><br /><small>{item.platformRefundCompleted ? "✓ Đã hoàn" : "Chưa hoàn"}</small></td>
                  <td><strong>{money(item.hotelDirectAmount)}</strong><br /><small>{item.hotelRefundCompleted ? "✓ Khách sạn đã hoàn" : "Chờ khách sạn"}</small></td>
                  <td><strong>{money(item.manualReconciliationAmount)}</strong><br /><small>{item.manualReconciliationCompleted ? "✓ Đã xử lý" : "Chưa xử lý"}</small></td>
                  <td>
                    <span className={`wallet-status ${String(item.status).toLowerCase()}`}>{refundStatusLabel(item.status)}</span>
                    <div className="wallet-actions refund-admin-actions">
                      {["APPROVED", "PARTIALLY_COMPLETED"].includes(item.status) && Number(item.platformHeldAmount ?? 0) > 0 && !item.platformRefundCompleted ? (
                        <button className="wallet-danger-button" type="button" disabled={busyId === item.id} onClick={() => void handleExecutePlatformRefund(item)}>Hoàn phần Enziu</button>
                      ) : null}
                      {["APPROVED", "PARTIALLY_COMPLETED"].includes(item.status) && Number(item.manualReconciliationAmount ?? 0) > 0 && !item.manualReconciliationCompleted ? (
                        <button className="primary" type="button" disabled={busyId === item.id} onClick={() => void handleManualResolved(item)}>Đã đối soát</button>
                      ) : null}
                      {item.hotelRefundProofAvailable ? (
                        <button className="wallet-proof-view-button" type="button" disabled={busyId === item.id} onClick={() => void openRefundHotelProof(item)}>Chứng từ hotel</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && refundRequests.length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">Chưa có yêu cầu hoàn tiền.</td></tr>
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
            <thead><tr><th>Booking</th><th>Đối tác</th><th>Đã thu</th><th>Hoa hồng</th><th>Khách sạn nhận</th><th>Thao tác</th></tr></thead>
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
                      "Đã chuyển doanh thu từ số dư đang giữ sang số dư khả dụng của đối tác.",
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

      {refundProofItem && refundProofUrl ? (
        <div className="wallet-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setRefundProofItem(null);
            URL.revokeObjectURL(refundProofUrl);
            setRefundProofUrl("");
          }
        }}>
          <section className="wallet-proof-modal">
            <button className="wallet-modal-close" type="button" onClick={() => {
              setRefundProofItem(null);
              URL.revokeObjectURL(refundProofUrl);
              setRefundProofUrl("");
            }}><X size={20} /></button>
            <div className="wallet-proof-modal-head">
              <div className="wallet-proof-success-icon"><CheckCircle2 size={25} /></div>
              <div><span className="wallet-page-kicker">CHỨNG TỪ KHÁCH SẠN HOÀN</span><h3>{refundProofItem.bookingCode}</h3><p>{money(refundProofItem.hotelDirectAmount)} · {refundProofItem.hotelRefundReference}</p></div>
            </div>
            <img className="wallet-proof-customer-image" src={refundProofUrl} alt="Chứng từ khách sạn hoàn tiền" />
          </section>
        </div>
      ) : null}

      {selectedWithdrawal ? (
        <div className="wallet-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWithdrawal();
        }}>
          <section className="wallet-withdrawal-modal">
            <button className="wallet-modal-close" type="button" onClick={closeWithdrawal}><X size={20} /></button>
            <div className="wallet-withdrawal-modal-head">
              <span className="wallet-page-kicker">XỬ LÝ RÚT TIỀN</span>
              <h2>Xử lý yêu cầu rút tiền</h2>
              <p>
                Chỉ hoàn tất yêu cầu sau khi đã chuyển khoản và có chứng từ.
              </p>
            </div>

            <div className="wallet-real-summary">
              <div><small>Số tiền phải chuyển</small><strong>{money(selectedWithdrawal.amount)}</strong></div>
              <div><small>Chủ ví</small><strong>{selectedWithdrawal.ownerType === "CUSTOMER" ? "Khách hàng" : "Đối tác"}</strong><span>{selectedWithdrawal.ownerId}</span></div>
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
                    <img src={receiverQrUrl} alt="QR nhận tiền" />
                    <p>Quét QR bằng ứng dụng ngân hàng và kiểm tra tên người nhận, số tiền trước khi chuyển.</p>
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
                <div className="wallet-real-section-title"><CheckCircle2 size={19} /><strong>Bước 2 · Xác nhận chuyển khoản</strong></div>
                <div className="wallet-helper wallet-helper-real">
                  Chuyển đúng <strong>{money(selectedWithdrawal.amount)}</strong>, sau đó nhập mã giao dịch và tải ảnh chứng từ để hoàn tất yêu cầu.
                </div>
                <label>Mã giao dịch / mã tham chiếu ngân hàng
                  <input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder="Ví dụ: FT260811123456" required />
                </label>
                <label className="wallet-upload-label wallet-proof-upload">
                  <ImageUp size={19} />
                  <span>Ảnh chứng từ chuyển khoản</span>
                  <small>PNG/JPG/WEBP · tối đa 5MB</small>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setTransferProof(event.target.files?.[0] ?? null)} required />
                </label>
                {transferProofPreview ? <img className="wallet-proof-preview" src={transferProofPreview} alt="Chứng từ sắp gửi" /> : null}
                <button className="wallet-primary-button wallet-real-paid-button" type="submit" disabled={busyId === selectedWithdrawal.id}>
                  <CheckCircle2 size={18} /> Tôi đã chuyển khoản · Hoàn tất
                </button>
              </form>
            ) : null}

            {selectedWithdrawal.status === "PAID" ? (
              <div className="wallet-paid-proof-panel">
                <CheckCircle2 size={28} />
                <div>
                  <strong>Đã chuyển tiền</strong>
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
