import {
  ArrowDownToLine,
  Banknote,
  CircleDollarSign,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../../components/ui";
import {
  createWithdrawal,
  getMyWallet,
  getMyWalletTransactionsPage,
  getMyWithdrawalsPage,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  normalizeEnum,
  STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/presentation";
import "../shared/WalletPage.css";
import "./CustomerAccountExperience.css";

const PAGE_SIZE = 8;
const EMPTY_PAGE = Object.freeze({ content: [], totalPages: 0, totalElements: 0 });

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`
    : "—";
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function transactionTypeLabel(type, referenceType) {
  if (
    normalizeEnum(type) === "CUSTOMER_REFUND_CREDIT"
    && normalizeEnum(referenceType) === "ROOM_CHANGE"
  ) {
    return "Hoàn chênh lệch đổi phòng";
  }
  return TRANSACTION_TYPE_LABELS[normalizeEnum(type)] ?? "Giao dịch Ví Enziu";
}

function withdrawalStatusLabel(status) {
  return ({
    PENDING: "Chờ System Admin duyệt",
    APPROVED: "Đã duyệt · chờ chuyển khoản",
    PROCESSING: "Đang xử lý thủ công",
    PAID: "Đã xác nhận chuyển khoản",
    REJECTED: "Đã từ chối",
    FAILED: "Xử lý thất bại",
    CANCELLED: "Đã hủy",
  }[normalizeEnum(status)] ?? STATUS_LABELS[normalizeEnum(status)] ?? "Chưa xác định");
}

export default function CustomerWalletPage() {
  const requestKeyRef = useRef("");
  const loadRequestRef = useRef(0);
  const [wallet, setWallet] = useState(null);
  const [transactionData, setTransactionData] = useState(EMPTY_PAGE);
  const [withdrawalData, setWithdrawalData] = useState(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    bankName: "",
    bankBin: "",
    accountNumber: "",
    accountName: "",
  });

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const [walletResult, transactionsResult, withdrawalsResult] = await Promise.all([
        getMyWallet(),
        getMyWalletTransactionsPage(transactionPage - 1, PAGE_SIZE),
        getMyWithdrawalsPage(withdrawalPage - 1, PAGE_SIZE),
      ]);
      if (loadRequestRef.current !== requestId) return false;
      setWallet(walletResult);
      setTransactionData(transactionsResult ?? EMPTY_PAGE);
      setWithdrawalData(withdrawalsResult ?? EMPTY_PAGE);
      return true;
    } catch (requestError) {
      if (loadRequestRef.current !== requestId) return false;
      setError(requestError.response?.data?.message ?? "Không thể tải Ví Enziu.");
      return false;
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [transactionPage, withdrawalPage]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { loadRequestRef.current += 1; }, []);
  useRealtimeRefresh("NOTIFICATION_CREATED", load, { debounceMs: 120 });

  function change(event) {
    const { name, value } = event.target;
    requestKeyRef.current = "";
    setForm((current) => ({ ...current, [name]: value }));
  }

  function validateAndConfirm(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Số tiền rút phải lớn hơn 0 ₫.");
      return;
    }
    if (amount < 10000) {
      setError("Số tiền rút tối thiểu là 10.000 ₫.");
      return;
    }
    if (amount > Number(wallet?.availableBalance ?? 0)) {
      setError("Số dư khả dụng không đủ cho yêu cầu này.");
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmWithdrawal() {
    const amount = Number(form.amount);
    if (!requestKeyRef.current) requestKeyRef.current = crypto.randomUUID();
    setSubmitting(true);
    setError("");
    try {
      await createWithdrawal({ ...form, amount }, requestKeyRef.current);
      requestKeyRef.current = "";
      setConfirmOpen(false);
      setForm((current) => ({ ...current, amount: "" }));
      setMessage("Yêu cầu đã được ghi nhận và tiền đã được giữ an toàn. System Admin sẽ chuyển khoản thủ công sau khi duyệt.");
      setTransactionPage(1);
      setWithdrawalPage(1);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tạo yêu cầu rút tiền.");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const available = Number(wallet?.availableBalance ?? 0);
  const locked = Number(wallet?.lockedBalance ?? 0);
  const totalCustomerFunds = available + locked;
  const requestedAmount = Number(form.amount || 0);
  const afterRequest = Math.max(0, available - (Number.isFinite(requestedAmount) ? requestedAmount : 0));

  const cards = useMemo(() => ([
    { label: "Số dư khả dụng", value: wallet?.availableBalance, help: "Có thể sử dụng hoặc yêu cầu rút", icon: WalletCards },
    { label: "Đang giữ để rút", value: wallet?.lockedBalance, help: "Chờ System Admin xử lý", icon: LockKeyhole },
    { label: "Tổng tiền trong ví", value: totalCustomerFunds, help: "Khả dụng + đang giữ để rút", icon: CircleDollarSign },
    { label: "Tổng đã rút", value: wallet?.totalWithdrawn, help: "Các yêu cầu đã hoàn tất", icon: ArrowDownToLine },
  ]), [totalCustomerFunds, wallet]);

  if (loading && !wallet) return <Loading message="Đang tải Ví Enziu..." />;

  return (
    <main className="wallet-page customer-wallet-page">
      <PageHeader
        className="wallet-page-heading"
        eyebrow="Trung tâm tài chính cá nhân"
        title="Enziu Wallet"
        description="Theo dõi số dư, tiền hoàn chênh lệch đổi phòng và yêu cầu rút tiền trong một nơi an toàn."
        icon={<WalletCards size={22} />}
        actions={(
          <button className="wallet-refresh-button" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} /> Làm mới
          </button>
        )}
      />

      <ErrorMessage message={error} onRetry={() => void load()} />
      {message ? <div className="wallet-message" role="status">{message}</div> : null}

      {!wallet ? (
        <EmptyState icon={<WalletCards size={28} />} title="Chưa thể hiển thị ví" description="Hãy thử làm mới sau ít phút." />
      ) : (
        <>
          <section className="wallet-balance-grid customer-wallet-balance-grid" aria-label="Tổng quan số dư">
            {cards.map(({ label, value, help, icon: Icon }) => (
              <article className="wallet-balance-card" key={label}>
                <div className="icon"><Icon size={21} /></div>
                <div><small>{label}</small><strong>{money(value)}</strong><span className="wallet-card-help">{help}</span></div>
              </article>
            ))}
          </section>

          <section className="wallet-content-grid customer-wallet-content-grid">
            <div className="wallet-panel">
              <div className="wallet-panel-header">
                <h2><History size={18} /> Lịch sử giao dịch</h2>
                <span>{Number(transactionData.totalElements ?? 0).toLocaleString("vi-VN")} giao dịch</span>
              </div>
              <div className="wallet-table-wrap">
                <table className="wallet-table">
                  <thead><tr><th>Thời gian</th><th>Loại</th><th>Tham chiếu</th><th>Số dư sau</th><th>Số tiền</th></tr></thead>
                  <tbody>
                    {(transactionData.content ?? []).map((item) => (
                      <tr key={item.id}>
                        <td data-label="Thời gian">{dateTime(item.createdAt)}</td>
                        <td data-label="Loại"><strong>{transactionTypeLabel(item.type, item.referenceType)}</strong><small className="wallet-row-description">{item.description || "—"}</small></td>
                        <td data-label="Tham chiếu">{item.referenceId ? <code>{item.referenceId.slice(0, 12)}…</code> : "—"}</td>
                        <td data-label="Số dư sau">{money(item.balanceAfter)}</td>
                        <td data-label="Số tiền" className={Number(item.amount) >= 0 ? "wallet-money-positive" : "wallet-money-negative"}>
                          {Number(item.amount) > 0 ? "+" : ""}{money(item.amount)}
                        </td>
                      </tr>
                    ))}
                    {!loading && (transactionData.content ?? []).length === 0 ? (
                      <tr><td colSpan="5" className="wallet-empty">Chưa có giao dịch nào.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={transactionPage} totalPages={Math.max(1, Number(transactionData.totalPages ?? 0))} onPageChange={setTransactionPage} ariaLabel="Phân trang lịch sử Ví Enziu" />
            </div>

            <aside className="wallet-side-stack">
              <div className="wallet-panel customer-withdrawal-card">
                <div className="wallet-panel-header"><h2><Banknote size={18} /> Yêu cầu rút tiền</h2></div>
                <div className="wallet-manual-settlement-note">
                  <ShieldCheck size={19} />
                  <p><strong>System Admin xử lý thủ công</strong><span>Gửi yêu cầu chưa có nghĩa là tiền đã được chuyển. Trạng thái sẽ được cập nhật sau khi đối soát hoàn tất.</span></p>
                </div>
                <form className="wallet-form" onSubmit={validateAndConfirm}>
                  <div className="wallet-available-inline"><span>Số dư có thể rút</span><strong>{money(wallet.availableBalance)}</strong></div>
                  <label>Số tiền rút
                    <input name="amount" type="number" min="10000" step="1000" value={form.amount} onChange={change} placeholder="1.250.000" required />
                  </label>
                  <label>Ngân hàng
                    <input name="bankName" value={form.bankName} onChange={change} placeholder="Ví dụ: ACB" required />
                  </label>
                  <div className="wallet-form-row">
                    <label>Mã BIN 6 số
                      <input name="bankBin" value={form.bankBin} onChange={change} inputMode="numeric" pattern="[0-9]{6}" placeholder="970416" required />
                    </label>
                    <label>Số tài khoản
                      <input name="accountNumber" value={form.accountNumber} onChange={change} inputMode="numeric" pattern="[0-9]{6,30}" required />
                    </label>
                  </div>
                  <label>Tên chủ tài khoản
                    <input name="accountName" value={form.accountName} onChange={change} autoComplete="name" required />
                  </label>
                  <div className="wallet-helper">Tiền được chuyển sang trạng thái đang giữ ngay khi yêu cầu được ghi nhận. Nếu bị từ chối, tiền tự động trở lại số dư khả dụng.</div>
                  <button className="wallet-primary-button" type="submit" disabled={submitting || requestedAmount > available}>
                    {submitting ? "Đang gửi..." : "Kiểm tra yêu cầu"}
                  </button>
                </form>
              </div>
            </aside>
          </section>

          <section className="wallet-panel">
            <div className="wallet-panel-header"><h2>Lịch sử yêu cầu rút</h2><span>{Number(withdrawalData.totalElements ?? 0).toLocaleString("vi-VN")} yêu cầu</span></div>
            <div className="wallet-table-wrap">
              <table className="wallet-table">
                <thead><tr><th>Ngày tạo</th><th>Số tiền</th><th>Điểm đến</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
                <tbody>
                  {(withdrawalData.content ?? []).map((item) => (
                    <tr key={item.id}>
                      <td data-label="Ngày tạo">{dateTime(item.requestedAt)}</td>
                      <td data-label="Số tiền"><strong>{money(item.amount)}</strong></td>
                      <td data-label="Điểm đến">{item.bankName || "Chưa xác định"}<br /><small>{item.accountNumber || "Chưa có số tài khoản"}</small></td>
                      <td data-label="Trạng thái"><StatusBadge status={item.status} label={withdrawalStatusLabel(item.status)} size="sm" /></td>
                      <td data-label="Cập nhật">{item.paidAt ? dateTime(item.paidAt) : item.reviewedAt ? dateTime(item.reviewedAt) : "—"}<small className="wallet-row-description">{item.reviewNote ?? item.failureReason ?? ""}</small></td>
                    </tr>
                  ))}
                  {!loading && (withdrawalData.content ?? []).length === 0 ? (
                    <tr><td colSpan="5" className="wallet-empty">Bạn chưa có yêu cầu rút tiền.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={withdrawalPage} totalPages={Math.max(1, Number(withdrawalData.totalPages ?? 0))} onPageChange={setWithdrawalPage} ariaLabel="Phân trang yêu cầu rút tiền" />
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận yêu cầu rút tiền"
        description={`Bạn đang yêu cầu rút ${money(requestedAmount)}.`}
        confirmLabel="Gửi yêu cầu"
        confirmTone="primary"
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmWithdrawal()}
      >
        <div className="customer-withdrawal-confirm">
          <dl>
            <div><dt>Số dư khả dụng hiện tại</dt><dd>{money(available)}</dd></div>
            <div><dt>Số dư sau khi gửi yêu cầu</dt><dd>{money(afterRequest)}</dd></div>
            <div><dt>Tài khoản nhận</dt><dd>{form.bankName} · ••••{form.accountNumber.slice(-4)}</dd></div>
          </dl>
          <p>Yêu cầu sẽ được System Admin xử lý thủ công. Đây chưa phải xác nhận tiền đã được chuyển.</p>
        </div>
      </ConfirmDialog>
    </main>
  );
}
