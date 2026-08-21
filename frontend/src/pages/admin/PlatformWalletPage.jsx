import {
  AlertTriangle,
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
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  Button,
  ConfirmDialog,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { getAdminUser } from "../../services/adminService";

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
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  normalizeEnum,
  REASON_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/presentation";
import "../shared/WalletPage.css";
import "./PlatformWalletPage.css";

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} ₫` : "—";
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

function payoutMethodLabel(value) {
  const normalized = normalizeEnum(value);
  if (normalized === "PERSONAL_QR") return "QR cá nhân";
  if (normalized === "BANK_AND_QR") return "Ngân hàng + QR cá nhân";
  if (normalized === "BANK_ACCOUNT") return "Tài khoản ngân hàng";
  return "Chưa xác định";
}

function ownerTypeLabel(value) {
  const normalized = normalizeEnum(value);
  return ROLE_LABELS[normalized] ?? "Chưa xác định";
}

function withdrawalStatusLabel(value) {
  const normalized = normalizeEnum(value);
  return ({
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt · chờ chuyển khoản",
    PROCESSING: "Đang xử lý",
    PAID: "Đã chuyển khoản",
    REJECTED: "Đã từ chối",
    FAILED: "Xử lý thất bại",
  }[normalized] ?? STATUS_LABELS[normalized] ?? "Chưa xác định");
}

function refundStatusLabel(value) {
  return STATUS_LABELS[normalizeEnum(value)] ?? "Chưa xác định";
}

function transactionLabel(value) {
  return TRANSACTION_TYPE_LABELS[normalizeEnum(value)] ?? "Giao dịch chưa xác định";
}

function refundReasonLabel(value) {
  const normalized = normalizeEnum(value);
  return ({
    HOTEL_AGREED: "Khách sạn đồng ý hoàn",
    DUPLICATE_PAYMENT: "Thanh toán trùng",
  }[normalized] ?? REASON_LABELS[normalized] ?? "Chưa cập nhật lý do");
}

function refundPolicyLabel(value) {
  return ({
    NO_SHOW_REVIEW: "Xem xét trường hợp không đến",
    STANDARD_REFUND: "Chính sách hoàn tiền tiêu chuẩn",
    HOTEL_AGREEMENT: "Thỏa thuận với khách sạn",
  }[normalizeEnum(value)] ?? "Chưa cập nhật chính sách");
}

function userDisplayName(user) {
  return user?.fullName?.trim()
    || user?.email
    || "Chưa cập nhật tên";
}

function componentCompletionLabel(amount, completed, completedText, pendingText) {
  if (amount === null || amount === undefined || amount === "") {
    return "Chưa xác định";
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) return "Chưa xác định";
  if (parsedAmount <= 0) return "Không phát sinh";
  return completed ? completedText : pendingText;
}

function resultErrorMessage(result, fallback) {
  return result?.reason?.response?.data?.message
    ?? result?.reason?.message
    ?? fallback;
}

export default function PlatformWalletPage() {
  const withdrawalDocumentsRequestRef = useRef(0);
  const refundProofRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [paidPayments, setPaidPayments] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [userDirectory, setUserDirectory] = useState({});
  const [userLookupFailures, setUserLookupFailures] = useState({});
  const [sourceAvailable, setSourceAvailable] = useState({
    wallet: false,
    transactions: false,
    withdrawals: false,
    payments: false,
    refunds: false,
  });
  const [sourceErrors, setSourceErrors] = useState({
    wallet: "",
    transactions: "",
    withdrawals: "",
    payments: "",
    refunds: "",
  });
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
  const [withdrawalDecision, setWithdrawalDecision] = useState(null);
  const [refundDecision, setRefundDecision] = useState(null);
  const [releaseCandidate, setReleaseCandidate] = useState(null);
  const [markPaidConfirmOpen, setMarkPaidConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const [
        walletResult,
        transactionResult,
        withdrawalResult,
        paymentResult,
        refundResult,
      ] = await Promise.allSettled([
        getPlatformWallet(),
        getPlatformWalletTransactions(),
        getWithdrawals(status),
        getPaymentsByStatus("PAID"),
        getAdminRefundRequests(),
      ]);

      if (loadRequestRef.current !== requestId) return false;

      const walletAvailable = walletResult.status === "fulfilled";
      const transactionsAvailable = transactionResult.status === "fulfilled"
        && Array.isArray(transactionResult.value);
      const withdrawalsAvailable = withdrawalResult.status === "fulfilled"
        && Array.isArray(withdrawalResult.value);
      const paymentsAvailable = paymentResult.status === "fulfilled"
        && Array.isArray(paymentResult.value);
      const refundsAvailable = refundResult.status === "fulfilled"
        && Array.isArray(refundResult.value);
      const safeWithdrawals = withdrawalsAvailable ? withdrawalResult.value : [];
      const safePayments = paymentsAvailable ? paymentResult.value : [];
      const safeRefunds = refundsAvailable ? refundResult.value : [];

      setSourceAvailable({
        wallet: walletAvailable,
        transactions: transactionsAvailable,
        withdrawals: withdrawalsAvailable,
        payments: paymentsAvailable,
        refunds: refundsAvailable,
      });
      setWallet(walletAvailable ? walletResult.value : null);
      setTransactions(transactionsAvailable ? transactionResult.value : []);
      setWithdrawals(safeWithdrawals);
      setPaidPayments(safePayments);
      setRefundRequests(safeRefunds);

      setSourceErrors({
        wallet: walletAvailable
          ? ""
          : resultErrorMessage(walletResult, "Không thể tải số dư ví nền tảng."),
        transactions: transactionsAvailable
          ? ""
          : resultErrorMessage(transactionResult, "Không thể tải lịch sử hoa hồng."),
        withdrawals: withdrawalsAvailable
          ? ""
          : resultErrorMessage(withdrawalResult, "Không thể tải yêu cầu rút tiền."),
        payments: paymentsAvailable
          ? ""
          : resultErrorMessage(paymentResult, "Không thể tải doanh thu đang giữ."),
        refunds: refundsAvailable
          ? ""
          : resultErrorMessage(refundResult, "Không thể tải danh sách yêu cầu hoàn tiền."),
      });

      const userIds = [...new Set([
        ...safeWithdrawals.map((item) => item.ownerId),
        ...safeRefunds.map((item) => item.customerId),
        ...safePayments.map((item) => item.hotelOwnerId),
      ].filter(Boolean).map(String))];
      const userResults = await Promise.allSettled(
        userIds.map(async (userId) => [userId, await getAdminUser(userId)]),
      );

      if (loadRequestRef.current !== requestId) return false;

      const nextDirectory = {};
      const nextLookupFailures = {};
      userResults.forEach((result, index) => {
        const userId = userIds[index];
        if (result.status === "fulfilled") {
          nextDirectory[userId] = result.value[1];
        } else {
          nextLookupFailures[userId] = true;
        }
      });
      setUserDirectory(nextDirectory);
      setUserLookupFailures(nextLookupFailures);

      setSelectedWithdrawal((current) => {
        if (!current) return current;
        return safeWithdrawals.find(
          (item) => item.id === current.id,
        ) ?? current;
      });
      return true;
    } catch (requestError) {
      if (loadRequestRef.current !== requestId) return false;
      setWallet(null);
      setTransactions([]);
      setWithdrawals([]);
      setPaidPayments([]);
      setRefundRequests([]);
      setUserDirectory({});
      setUserLookupFailures({});
      setSourceAvailable({
        wallet: false,
        transactions: false,
        withdrawals: false,
        payments: false,
        refunds: false,
      });
      const fallbackMessage = requestError.response?.data?.message
        ?? "Không thể tải dữ liệu tài chính nền tảng.";
      setSourceErrors({
        wallet: fallbackMessage,
        transactions: fallbackMessage,
        withdrawals: fallbackMessage,
        payments: fallbackMessage,
        refunds: fallbackMessage,
      });
      setError(fallbackMessage);
      return false;
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
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
  }, [receiverQrUrl]);

  useEffect(() => () => {
    if (savedProofUrl) URL.revokeObjectURL(savedProofUrl);
  }, [savedProofUrl]);

  useEffect(() => () => {
    if (refundProofUrl) URL.revokeObjectURL(refundProofUrl);
  }, [refundProofUrl]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    withdrawalDocumentsRequestRef.current += 1;
    refundProofRequestRef.current += 1;
  }, []);

  async function run(id, action, successMessage) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await load();
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể xử lý yêu cầu.");
      return false;
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

  async function handleApproveReal(item, note = "") {
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const updated = await approveWithdrawal(item.id, note, false);
      setSelectedWithdrawal((current) => current?.id === item.id ? { ...current, ...updated } : current);
      setWithdrawalDecision(null);
      setMessage("Đã duyệt. Hãy chuyển khoản theo thông tin nhận tiền, sau đó tải chứng từ để hoàn tất.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể duyệt yêu cầu rút tiền.");
    } finally {
      setBusyId("");
    }
  }

  async function handleReject(item, note) {
    if (!note?.trim()) return;
    const completed = await run(
      item.id,
      () => rejectWithdrawal(item.id, note.trim()),
      "Đã từ chối và hoàn số dư cho chủ ví.",
    );
    if (completed) setWithdrawalDecision(null);
  }

  function openWithdrawalDecision(item, type) {
    setError("");
    setMessage("");
    setWithdrawalDecision({ item, type, note: "" });
  }

  function openRefundDecision(item, type) {
    setError("");
    setMessage("");
    setRefundDecision({ item, type, note: "" });
  }

  function openReleaseConfirmation(item) {
    setError("");
    setMessage("");
    setReleaseCandidate(item);
  }

  function handleMarkPaidReal(event) {
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
    setError("");
    setMarkPaidConfirmOpen(true);
  }

  async function confirmMarkPaidReal() {
    const item = selectedWithdrawal;
    if (!item || !transferReference.trim() || !transferProof) return;
    setBusyId(item.id);
    setError("");
    setMessage("");

    let updated;
    try {
      updated = await markWithdrawalPaid(
        item.id,
        transferReference.trim(),
        transferProof,
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể xác nhận chuyển tiền.",
      );
      setMarkPaidConfirmOpen(false);
      setBusyId("");
      return;
    }

    setSelectedWithdrawal((current) => (
      current?.id === item.id ? { ...current, ...updated } : current
    ));
    setMarkPaidConfirmOpen(false);
    setMessage(
      "Đã ghi nhận chuyển khoản. Số tiền đã được trừ khỏi phần đang giữ và chứng từ đã được lưu.",
    );
    setTransferProof(null);

    let proofWarning = "";
    try {
      const blob = await getWithdrawalTransferProof(item.id);
      setSavedProofUrl(URL.createObjectURL(blob));
    } catch (requestError) {
      proofWarning = requestError.response?.data?.message
        ?? "Giao dịch đã hoàn tất nhưng chưa thể tải lại ảnh chứng từ.";
    }

    await load();
    if (proofWarning) {
      setError((current) => current
        ? `${current} ${proofWarning}`
        : proofWarning);
    }
    setBusyId("");
  }

  async function handleExecutePlatformRefund(item) {
    const completed = await run(
      item.id,
      () => executePlatformRefund(item.id),
      "Đã hoàn phần tiền EnziuRooms đang giữ vào Ví Enziu của khách.",
    );
    if (completed) setRefundDecision(null);
  }

  async function handleManualResolved(item, note) {
    if (!note?.trim()) return;
    const completed = await run(
      item.id,
      () => markManualRefundResolved(item.id, note.trim()),
      "Đã ghi nhận hoàn tất phần đối soát thủ công.",
    );
    if (completed) setRefundDecision(null);
  }

  async function openRefundHotelProof(item) {
    const requestId = refundProofRequestRef.current + 1;
    refundProofRequestRef.current = requestId;
    setBusyId(item.id);
    setError("");
    try {
      const blob = await getRefundHotelProof(item.id);
      if (refundProofRequestRef.current !== requestId) return;
      setRefundProofUrl(URL.createObjectURL(blob));
      setRefundProofItem(item);
    } catch (requestError) {
      if (refundProofRequestRef.current === requestId) {
        setError(
          requestError.response?.data?.message
            ?? "Không thể tải chứng từ khách sạn hoàn tiền.",
        );
      }
    } finally {
      if (refundProofRequestRef.current === requestId) setBusyId("");
    }
  }

  function closeRefundHotelProof() {
    refundProofRequestRef.current += 1;
    setRefundProofItem(null);
    setRefundProofUrl("");
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

  const pendingRevenue = useMemo(
    () => paidPayments.filter((item) => item.walletApplied && !item.revenueReleased),
    [paidPayments],
  );

  const sourceIssues = useMemo(
    () => Object.entries(sourceErrors)
      .filter(([, messageText]) => Boolean(messageText))
      .map(([source, messageText]) => ({ source, message: messageText })),
    [sourceErrors],
  );

  function directoryUser(userId) {
    if (!userId) return null;
    return userDirectory[String(userId)] ?? null;
  }

  function directoryDisplayName(userId) {
    if (!userId) return "Chưa có thông tin người dùng";
    const normalizedId = String(userId);
    const user = userDirectory[normalizedId];
    if (user) return userDisplayName(user);
    return userLookupFailures[normalizedId]
      ? "Chưa tải được tên"
      : "Chưa cập nhật tên";
  }

  if (loading && !wallet) {
    return <Loading message="Đang tải ví nền tảng và dữ liệu đối soát..." />;
  }

  return (
    <main className="wallet-page system-wallet-page">
      <PageHeader
        eyebrow="Tài chính nền tảng"
        title="Ví EnziuRooms & đối soát"
        description="Theo dõi hoa hồng, xử lý rút tiền, hoàn tiền và giải ngân từ dữ liệu giao dịch thực tế."
        icon={<WalletCards size={22} />}
        actions={(
          <button className="wallet-refresh-button" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} /> Làm mới
          </button>
        )}
      />

      <ErrorMessage message={error} onRetry={() => void load()} />
      {sourceIssues.length ? (
        <div className="system-wallet-source-warning" role="status">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>Một số nguồn tài chính chưa tải đầy đủ</strong>
            <ul>
              {sourceIssues.map((issue) => (
                <li key={issue.source}>{issue.message}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>Thử tải lại</button>
        </div>
      ) : null}
      {message ? <div className="wallet-message" role="status">{message}</div> : null}

      <section className="system-wallet-stats" aria-label="Chỉ số tài chính nền tảng">
        <StatCard label="Hoa hồng khả dụng" value={sourceAvailable.wallet ? money(wallet?.availableBalance) : "—"} icon={<BadgeDollarSign size={21} />} tone="success" />
        <StatCard label="Tổng hoa hồng" value={sourceAvailable.wallet ? money(wallet?.totalEarned) : "—"} icon={<CircleDollarSign size={21} />} tone="info" />
        <StatCard label="Doanh thu đang giữ" value={sourceAvailable.wallet ? money(wallet?.pendingBalance) : "—"} icon={<Clock3 size={21} />} tone="warning" />
        <StatCard
          label={status ? "Yêu cầu rút theo bộ lọc" : "Yêu cầu rút"}
          value={sourceAvailable.withdrawals
            ? withdrawals.length.toLocaleString("vi-VN")
            : "—"}
          icon={<HandCoins size={21} />}
          tone="violet"
        />
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header">
          <h2><Banknote size={18} /> Yêu cầu rút tiền</h2>
          <label className="system-wallet-filter">
            <span>Trạng thái</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt - chờ chuyển khoản</option>
              <option value="PROCESSING">Đang xử lý</option>
              <option value="PAID">Đã chuyển</option>
              <option value="REJECTED">Đã từ chối</option>
              <option value="FAILED">Xử lý thất bại</option>
            </select>
          </label>
        </div>
        {sourceErrors.withdrawals ? (
          <div className="system-wallet-source-note"><AlertTriangle size={16} /> <span>{sourceErrors.withdrawals}</span></div>
        ) : null}
        <div className="wallet-table-wrap">
          <table className="wallet-table" aria-label="Danh sách yêu cầu rút tiền">
            <thead><tr><th>Chủ ví</th><th>Nhận tiền bằng</th><th>Số tiền</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
            <tbody>
              {withdrawals.map((item) => {
                const owner = directoryUser(item.ownerId ?? item.hotelOwnerId);
                return (
                  <tr key={item.id}>
                    <td data-label="Chủ ví">
                      <strong>{directoryDisplayName(item.ownerId ?? item.hotelOwnerId)}</strong>
                      <br /><small>{ownerTypeLabel(item.ownerType)}{owner?.email ? ` · ${owner.email}` : ""}</small>
                      {!owner ? <><br /><small className="system-reference">Tham chiếu: {item.ownerId ?? item.hotelOwnerId ?? "—"}</small></> : null}
                    </td>
                    <td data-label="Nhận tiền bằng">
                      <strong>{payoutMethodLabel(item.payoutMethod)}</strong>
                      {item.bankName ? <><br /><small>{item.bankName} · {item.accountNumber} · {item.accountName}</small></> : null}
                      {item.receiverQrAvailable ? <><br /><small>Đã cung cấp QR cá nhân</small></> : null}
                    </td>
                    <td data-label="Số tiền"><strong>{money(item.amount)}</strong></td>
                    <td data-label="Trạng thái"><StatusBadge status={item.status} label={withdrawalStatusLabel(item.status)} size="sm" /></td>
                    <td data-label="Ngày tạo">{dateTime(item.requestedAt)}</td>
                    <td data-label="Thao tác">
                      <div className="wallet-actions">
                        <button className="primary" type="button" disabled={busyId === item.id} onClick={() => void openWithdrawal(item)}>
                          {normalizeEnum(item.status) === "PAID" ? "Xem chứng từ" : "Xem & xử lý"}
                        </button>
                        {normalizeEnum(item.status) === "PENDING" ? (
                          <button className="danger" type="button" disabled={busyId === item.id} onClick={() => openWithdrawalDecision(item, "reject")}>Từ chối</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && withdrawals.length === 0 ? (
                <tr>
                  <td colSpan="6" className="wallet-empty">
                    {sourceAvailable.withdrawals
                      ? "Không có yêu cầu rút tiền phù hợp."
                      : "Chưa thể tải danh sách yêu cầu rút tiền."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel refund-workflow-panel">
        <div className="wallet-panel-header">
          <h2><CircleDollarSign size={18} /> Yêu cầu hoàn tiền & đối soát</h2>
          <span>{sourceAvailable.refunds ? `${refundRequests.length} yêu cầu` : "Chưa tải được"}</span>
        </div>
        <div className="wallet-helper wallet-helper-real">
          Quản trị viên chỉ hoàn phần EnziuRooms còn giữ. Khoản khách sạn đã thu trực tiếp cần chứng từ; khoản đã giải ngân cần đối soát thủ công.
        </div>
        {sourceErrors.refunds ? (
          <div className="system-wallet-source-note"><AlertTriangle size={16} /> <span>{sourceErrors.refunds}</span></div>
        ) : null}
        <div className="wallet-table-wrap">
          <table className="wallet-table system-refund-table" aria-label="Yêu cầu hoàn tiền và đối soát">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Đơn đặt phòng</th>
                <th>Khách đã trả</th>
                <th>EnziuRooms giữ</th>
                <th>Khách sạn đã thu</th>
                <th>Đối soát</th>
                <th>Lý do</th>
                <th>Chính sách</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {refundRequests.map((item) => {
                const customer = directoryUser(item.customerId);
                return (
                  <tr key={`refund-request-${item.id}`}>
                    <td data-label="Khách hàng">
                      <strong>{directoryDisplayName(item.customerId)}</strong>
                      {customer?.email ? <><br /><small>{customer.email}</small></> : null}
                      {!customer && item.customerId ? <><br /><small className="system-reference">Tham chiếu: {item.customerId}</small></> : null}
                    </td>
                    <td data-label="Đơn đặt phòng"><strong>{item.bookingCode || "Chưa có mã"}</strong><br /><small>{dateTime(item.requestedAt)}</small></td>
                    <td data-label="Khách đã trả"><strong>{money(item.totalPaidAmount)}</strong></td>
                    <td data-label="EnziuRooms giữ"><strong>{money(item.platformHeldAmount)}</strong><br /><small>{componentCompletionLabel(item.platformHeldAmount, item.platformRefundCompleted, "Đã hoàn", "Chưa hoàn")}</small></td>
                    <td data-label="Khách sạn đã thu"><strong>{money(item.hotelDirectAmount)}</strong><br /><small>{componentCompletionLabel(item.hotelDirectAmount, item.hotelRefundCompleted, "Khách sạn đã hoàn", "Chờ khách sạn")}</small></td>
                    <td data-label="Đối soát"><strong>{money(item.manualReconciliationAmount)}</strong><br /><small>{componentCompletionLabel(item.manualReconciliationAmount, item.manualReconciliationCompleted, "Đã xử lý", "Chưa xử lý")}</small></td>
                    <td data-label="Lý do"><strong>{refundReasonLabel(item.reasonCode)}</strong>{item.customerNote ? <><br /><small>{item.customerNote}</small></> : null}</td>
                    <td data-label="Chính sách"><strong>{refundPolicyLabel(item.policyCode)}</strong>{item.policyMessage ? <><br /><small>{item.policyMessage}</small></> : null}</td>
                    <td data-label="Trạng thái"><StatusBadge status={item.status} label={refundStatusLabel(item.status)} size="sm" /></td>
                    <td data-label="Thao tác">
                      <div className="wallet-actions refund-admin-actions">
                        {["APPROVED", "PARTIALLY_COMPLETED"].includes(normalizeEnum(item.status)) && Number(item.platformHeldAmount ?? 0) > 0 && !item.platformRefundCompleted ? (
                          <button className="wallet-danger-button" type="button" disabled={busyId === item.id} onClick={() => openRefundDecision(item, "platform")}>Hoàn phần EnziuRooms</button>
                        ) : null}
                        {["APPROVED", "PARTIALLY_COMPLETED"].includes(normalizeEnum(item.status)) && Number(item.manualReconciliationAmount ?? 0) > 0 && !item.manualReconciliationCompleted ? (
                          <button className="primary" type="button" disabled={busyId === item.id} onClick={() => openRefundDecision(item, "manual")}>Ghi nhận đối soát</button>
                        ) : null}
                        {item.hotelRefundProofAvailable ? (
                          <button className="wallet-proof-view-button" type="button" disabled={busyId === item.id} onClick={() => void openRefundHotelProof(item)}>Chứng từ khách sạn</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && refundRequests.length === 0 ? (
                <tr><td colSpan="10" className="wallet-empty">{sourceAvailable.refunds ? "Chưa có yêu cầu hoàn tiền." : "Chưa thể tải yêu cầu hoàn tiền."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header">
          <h2><Clock3 size={18} /> Doanh thu khách sạn đang giữ</h2>
          <span>{sourceAvailable.payments ? `${pendingRevenue.length} khoản` : "Chưa tải được"}</span>
        </div>
        {sourceErrors.payments ? (
          <div className="system-wallet-source-note"><AlertTriangle size={16} /> <span>{sourceErrors.payments}</span></div>
        ) : null}
        <div className="wallet-table-wrap">
          <table className="wallet-table" aria-label="Doanh thu khách sạn chờ giải ngân">
            <thead><tr><th>Đơn đặt phòng</th><th>Đối tác</th><th>Đã thu</th><th>Hoa hồng</th><th>Khách sạn nhận</th><th>Thao tác</th></tr></thead>
            <tbody>
              {pendingRevenue.map((item) => {
                const partner = directoryUser(item.hotelOwnerId);
                return (
                  <tr key={item.id}>
                    <td data-label="Đơn đặt phòng"><strong>{dateTime(item.paidAt)}</strong><br /><small className="system-reference">Tham chiếu: {item.bookingId ?? "—"}</small></td>
                    <td data-label="Đối tác">
                      <strong>{directoryDisplayName(item.hotelOwnerId)}</strong>
                      {partner?.email ? <><br /><small>{partner.email}</small></> : null}
                      {!partner && item.hotelOwnerId ? <><br /><small className="system-reference">Tham chiếu: {item.hotelOwnerId}</small></> : null}
                    </td>
                    <td data-label="Đã thu">{money(item.amount)}</td>
                    <td data-label="Hoa hồng">{money(item.commissionAmount)}</td>
                    <td data-label="Khách sạn nhận"><strong>{money(item.hotelNetAmount)}</strong></td>
                    <td data-label="Thao tác">
                      <button className="primary" type="button" disabled={busyId === item.id} onClick={() => openReleaseConfirmation(item)}>Giải ngân</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && pendingRevenue.length === 0 ? (
                <tr><td colSpan="6" className="wallet-empty">{sourceAvailable.payments ? "Không có doanh thu khách sạn đang chờ giải ngân." : "Chưa thể tải doanh thu khách sạn đang giữ."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header"><h2><WalletCards size={18} /> Lịch sử hoa hồng</h2><span>{sourceAvailable.transactions ? `${transactions.length} giao dịch` : "Chưa tải được"}</span></div>
        {sourceErrors.transactions ? (
          <div className="system-wallet-source-note"><AlertTriangle size={16} /> <span>{sourceErrors.transactions}</span></div>
        ) : null}
        <div className="wallet-table-wrap">
          <table className="wallet-table" aria-label="Lịch sử giao dịch hoa hồng">
            <thead><tr><th>Thời gian</th><th>Loại</th><th>Nội dung</th><th>Số tiền</th></tr></thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id}>
                  <td data-label="Thời gian">{dateTime(item.createdAt)}</td>
                  <td data-label="Loại"><strong>{transactionLabel(item.type)}</strong></td>
                  <td data-label="Nội dung">{item.description || "Không có ghi chú"}</td>
                  <td data-label="Số tiền" className={Number(item.amount) >= 0 ? "wallet-money-positive" : "wallet-money-negative"}>
                    {Number(item.amount) > 0 ? "+" : ""}{money(item.amount)}
                  </td>
                </tr>
              ))}
              {!loading && transactions.length === 0 ? (
                <tr><td colSpan="4" className="wallet-empty">{sourceAvailable.transactions ? "Chưa có hoa hồng được ghi nhận." : "Chưa thể tải lịch sử hoa hồng."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(refundProofItem && refundProofUrl)}
        onClose={closeRefundHotelProof}
        title="Chứng từ khách sạn hoàn tiền"
        description={refundProofItem?.bookingCode ? `Đơn ${refundProofItem.bookingCode}` : undefined}
        size="lg"
        className="system-wallet-proof-dialog"
      >
        {refundProofItem && refundProofUrl ? (
          <div className="system-wallet-proof-content">
            <div className="wallet-proof-modal-head">
              <div className="wallet-proof-success-icon"><CheckCircle2 size={25} /></div>
              <div><strong>{money(refundProofItem.hotelDirectAmount)}</strong><p>{refundProofItem.hotelRefundReference || "Chưa có mã tham chiếu"}</p></div>
            </div>
            <img className="wallet-proof-customer-image" src={refundProofUrl} alt="Chứng từ khách sạn hoàn tiền" />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedWithdrawal) && !withdrawalDecision && !markPaidConfirmOpen}
        onClose={busyId ? undefined : closeWithdrawal}
        title="Xử lý yêu cầu rút tiền"
        description="Chỉ hoàn tất sau khi đã chuyển đúng người nhận và lưu chứng từ."
        size="xl"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
        hideCloseButton={Boolean(busyId)}
        className="system-wallet-withdrawal-dialog"
        bodyClassName="system-wallet-withdrawal-body"
      >
        {selectedWithdrawal ? (
          <div className="system-wallet-withdrawal-content">
            <ErrorMessage message={error} />
            <div className="wallet-real-summary">
              <div><small>Số tiền phải chuyển</small><strong>{money(selectedWithdrawal.amount)}</strong></div>
              <div>
                <small>Chủ ví</small>
                <strong>{directoryDisplayName(selectedWithdrawal.ownerId ?? selectedWithdrawal.hotelOwnerId)}</strong>
                <span>
                  {ownerTypeLabel(selectedWithdrawal.ownerType)}
                  {!directoryUser(selectedWithdrawal.ownerId ?? selectedWithdrawal.hotelOwnerId)
                    ? ` · Tham chiếu ${selectedWithdrawal.ownerId ?? selectedWithdrawal.hotelOwnerId ?? "—"}`
                    : ""}
                </span>
              </div>
              <div><small>Phương thức</small><strong>{payoutMethodLabel(selectedWithdrawal.payoutMethod)}</strong></div>
              <div><small>Trạng thái</small><StatusBadge status={selectedWithdrawal.status} label={withdrawalStatusLabel(selectedWithdrawal.status)} size="sm" /></div>
            </div>

            {selectedWithdrawal.bankName ? (
              <div className="wallet-real-destination">
                <div className="wallet-real-section-title"><Banknote size={19} /><strong>Tài khoản ngân hàng nhận tiền</strong></div>
                <div className="wallet-bank-detail-grid">
                  <div><small>Ngân hàng</small><strong>{selectedWithdrawal.bankName}</strong></div>
                  <div><small>BIN</small><strong>{selectedWithdrawal.bankBin || "—"}</strong></div>
                  <div className="wide"><small>Số tài khoản</small><strong>{selectedWithdrawal.accountNumber || "—"}</strong><button type="button" onClick={() => copyText(selectedWithdrawal.accountNumber)}><ClipboardCopy size={15} /> Sao chép</button></div>
                  <div className="wide"><small>Chủ tài khoản</small><strong>{selectedWithdrawal.accountName || "—"}</strong><button type="button" onClick={() => copyText(selectedWithdrawal.accountName)}><ClipboardCopy size={15} /> Sao chép</button></div>
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
                ) : <p role="status">Đang tải QR...</p>}
              </div>
            ) : null}

            {normalizeEnum(selectedWithdrawal.status) === "PENDING" ? (
              <div className="wallet-real-approval-box">
                <ShieldCheck size={22} />
                <div>
                  <strong>Bước 1 · Duyệt thông tin nhận tiền</strong>
                  <p>Duyệt chỉ xác nhận thông tin hợp lệ, chưa được coi là đã chuyển tiền.</p>
                </div>
                <button className="wallet-primary-button" type="button" disabled={busyId === selectedWithdrawal.id} onClick={() => openWithdrawalDecision(selectedWithdrawal, "approve")}>
                  Duyệt để chuyển tiền
                </button>
              </div>
            ) : null}

            {["APPROVED", "PROCESSING"].includes(normalizeEnum(selectedWithdrawal.status)) ? (
              <form className="wallet-real-transfer-form" onSubmit={handleMarkPaidReal}>
                <div className="wallet-real-section-title"><CheckCircle2 size={19} /><strong>Bước 2 · Xác nhận chuyển khoản</strong></div>
                <div className="wallet-helper wallet-helper-real">
                  Chuyển đúng <strong>{money(selectedWithdrawal.amount)}</strong>, sau đó nhập mã giao dịch và tải ảnh chứng từ.
                </div>
                <label>Mã giao dịch / mã tham chiếu ngân hàng
                  <input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder="Nhập mã từ giao dịch ngân hàng" required />
                </label>
                <label className="wallet-upload-label wallet-proof-upload">
                  <ImageUp size={19} />
                  <span>Ảnh chứng từ chuyển khoản</span>
                  <small>PNG/JPG/WEBP · tối đa 5MB</small>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setTransferProof(event.target.files?.[0] ?? null)} required />
                </label>
                {transferProofPreview ? <img className="wallet-proof-preview" src={transferProofPreview} alt="Chứng từ sắp gửi" /> : null}
                <button className="wallet-primary-button wallet-real-paid-button" type="submit" disabled={busyId === selectedWithdrawal.id}>
                  <CheckCircle2 size={18} /> Xác nhận đã chuyển khoản
                </button>
              </form>
            ) : null}

            {normalizeEnum(selectedWithdrawal.status) === "PAID" ? (
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
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(withdrawalDecision)}
        onClose={busyId ? undefined : () => setWithdrawalDecision(null)}
        title={withdrawalDecision?.type === "approve" ? "Duyệt yêu cầu rút tiền" : "Từ chối yêu cầu rút tiền"}
        description={withdrawalDecision?.item ? `${directoryDisplayName(withdrawalDecision.item.ownerId ?? withdrawalDecision.item.hotelOwnerId)} · ${money(withdrawalDecision.item.amount)}` : undefined}
        size="sm"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
        hideCloseButton={Boolean(busyId)}
        footer={(
          <>
            <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setWithdrawalDecision(null)}>Hủy</Button>
            <Button
              variant={withdrawalDecision?.type === "approve" ? "primary" : "danger"}
              loading={Boolean(busyId)}
              disabled={withdrawalDecision?.type === "reject" && !withdrawalDecision?.note?.trim()}
              onClick={() => {
                if (!withdrawalDecision?.item) return;
                if (withdrawalDecision.type === "approve") {
                  void handleApproveReal(withdrawalDecision.item, withdrawalDecision.note.trim());
                } else {
                  void handleReject(withdrawalDecision.item, withdrawalDecision.note);
                }
              }}
            >
              {withdrawalDecision?.type === "approve" ? "Xác nhận duyệt" : "Xác nhận từ chối"}
            </Button>
          </>
        )}
      >
        {withdrawalDecision ? (
          <div className="system-wallet-decision-content">
            <ErrorMessage message={error} />
            <label className="system-wallet-decision-field">
              <span>{withdrawalDecision.type === "approve" ? "Ghi chú duyệt (không bắt buộc)" : "Lý do từ chối *"}</span>
              <textarea
                rows={4}
                maxLength={500}
                value={withdrawalDecision.note}
                onChange={(event) => setWithdrawalDecision((current) => ({ ...current, note: event.target.value }))}
                placeholder={withdrawalDecision.type === "approve" ? "Thêm ghi chú nếu cần" : "Nhập lý do để chủ ví hiểu quyết định"}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(refundDecision)}
        onClose={busyId ? undefined : () => setRefundDecision(null)}
        title={refundDecision?.type === "platform" ? "Hoàn phần EnziuRooms đang giữ" : "Ghi nhận đối soát thủ công"}
        description={refundDecision?.item?.bookingCode ? `Đơn ${refundDecision.item.bookingCode}` : undefined}
        size="sm"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
        hideCloseButton={Boolean(busyId)}
        footer={(
          <>
            <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => setRefundDecision(null)}>Hủy</Button>
            <Button
              variant={refundDecision?.type === "platform" ? "danger" : "primary"}
              loading={Boolean(busyId)}
              disabled={refundDecision?.type === "manual" && !refundDecision?.note?.trim()}
              onClick={() => {
                if (!refundDecision?.item) return;
                if (refundDecision.type === "platform") {
                  void handleExecutePlatformRefund(refundDecision.item);
                } else {
                  void handleManualResolved(refundDecision.item, refundDecision.note);
                }
              }}
            >
              {refundDecision?.type === "platform" ? "Xác nhận hoàn tiền" : "Xác nhận đã đối soát"}
            </Button>
          </>
        )}
      >
        {refundDecision ? (
          <div className="system-wallet-refund-decision">
            <ErrorMessage message={error} />
            <dl>
              <div><dt>Khách hàng</dt><dd>{directoryDisplayName(refundDecision.item.customerId)}</dd></div>
              <div><dt>Số tiền</dt><dd>{money(refundDecision.type === "platform" ? refundDecision.item.platformHeldAmount : refundDecision.item.manualReconciliationAmount)}</dd></div>
            </dl>
            {refundDecision.type === "manual" ? (
              <label className="system-wallet-decision-field">
                <span>Nội dung đối soát *</span>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={refundDecision.note}
                  onChange={(event) => setRefundDecision((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Ghi rõ kết quả đối soát với khách và khách sạn"
                />
              </label>
            ) : (
              <p>Khoản tiền này sẽ được hoàn vào Ví Enziu của khách theo dữ liệu yêu cầu.</p>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(releaseCandidate)}
        title="Giải ngân doanh thu cho đối tác"
        description={releaseCandidate ? `${directoryDisplayName(releaseCandidate.hotelOwnerId)} · ${money(releaseCandidate.hotelNetAmount)}` : undefined}
        confirmLabel="Xác nhận giải ngân"
        confirmTone="primary"
        busy={Boolean(releaseCandidate && busyId === releaseCandidate.id)}
        onCancel={() => setReleaseCandidate(null)}
        onConfirm={async () => {
          if (!releaseCandidate) return;
          const completed = await run(
            releaseCandidate.id,
            () => releaseHotelRevenue(releaseCandidate.id),
            "Đã chuyển doanh thu từ số dư đang giữ sang số dư khả dụng của đối tác.",
          );
          if (completed) setReleaseCandidate(null);
        }}
      >
        <ErrorMessage message={error} />
        <p>Hãy chỉ tiếp tục sau khi đã kiểm tra đúng khoản doanh thu cần giải ngân.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={markPaidConfirmOpen}
        title="Xác nhận đã chuyển khoản"
        description={selectedWithdrawal ? `${directoryDisplayName(selectedWithdrawal.ownerId ?? selectedWithdrawal.hotelOwnerId)} · ${money(selectedWithdrawal.amount)}` : undefined}
        confirmLabel="Hoàn tất yêu cầu rút"
        confirmTone="primary"
        busy={Boolean(selectedWithdrawal && busyId === selectedWithdrawal.id)}
        onCancel={() => setMarkPaidConfirmOpen(false)}
        onConfirm={() => void confirmMarkPaidReal()}
      >
        <p>Mã giao dịch và ảnh chứng từ sẽ được lưu cùng yêu cầu này.</p>
      </ConfirmDialog>
    </main>
  );
}
