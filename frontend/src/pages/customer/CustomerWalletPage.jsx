import {
  ArrowDownToLine,
  Banknote,
  History,
  LockKeyhole,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
} from "../../components/ui";
import {
  createWithdrawal,
  getMyWallet,
  getMyWalletTransactions,
  getMyWithdrawals,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  normalizeEnum,
  STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/presentation";
import "../shared/WalletPage.css";
import "./CustomerAccountExperience.css";

const TABLE_PAGE_SIZE = 8;

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function transactionTypeLabel(type) {
  return TRANSACTION_TYPE_LABELS[normalizeEnum(type)] ?? "Chưa xác định";
}

function withdrawalStatusLabel(status) {
  return STATUS_LABELS[normalizeEnum(status)] ?? "Chưa xác định";
}

export default function CustomerWalletPage() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [form, setForm] = useState({
    amount: "",
    bankName: "",
    bankBin: "",
    accountNumber: "",
    accountName: "",
  });

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
      setError(requestError.response?.data?.message ?? "Không thể tải Ví Enziu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh("NOTIFICATION_CREATED", load, { debounceMs: 120 });

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitWithdrawal(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 10000) {
      setError("Số tiền rút tối thiểu là 10.000 ₫.");
      return;
    }
    if (amount > Number(wallet?.availableBalance ?? 0)) {
      setError("Số dư khả dụng không đủ.");
      return;
    }

    setSubmitting(true);
    try {
      await createWithdrawal({ ...form, amount });
      setForm((current) => ({ ...current, amount: "" }));
      setMessage("Đã gửi yêu cầu rút tiền. Bạn có thể theo dõi trạng thái tại đây.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tạo yêu cầu rút tiền.");
    } finally {
      setSubmitting(false);
    }
  }

  const cards = [
    ["Số dư khả dụng", wallet?.availableBalance, WalletCards],
    ["Đang chờ rút", wallet?.lockedBalance, LockKeyhole],
    ["Tổng đã rút", wallet?.totalWithdrawn, ArrowDownToLine],
  ];

  const transactionPages = Math.max(1, Math.ceil(transactions.length / TABLE_PAGE_SIZE));
  const withdrawalPages = Math.max(1, Math.ceil(withdrawals.length / TABLE_PAGE_SIZE));
  const visibleTransactions = useMemo(
    () => transactions.slice(
      (transactionPage - 1) * TABLE_PAGE_SIZE,
      transactionPage * TABLE_PAGE_SIZE,
    ),
    [transactionPage, transactions],
  );
  const visibleWithdrawals = useMemo(
    () => withdrawals.slice(
      (withdrawalPage - 1) * TABLE_PAGE_SIZE,
      withdrawalPage * TABLE_PAGE_SIZE,
    ),
    [withdrawalPage, withdrawals],
  );

  useEffect(() => {
    setTransactionPage((current) => Math.min(current, transactionPages));
  }, [transactionPages]);

  useEffect(() => {
    setWithdrawalPage((current) => Math.min(current, withdrawalPages));
  }, [withdrawalPages]);

  if (loading && !wallet) {
    return <Loading message="Đang tải Ví Enziu..." />;
  }

  return (
    <main className="wallet-page customer-wallet-page">
      <PageHeader
        className="wallet-page-heading"
        eyebrow="Ví khách hàng"
        title="Ví Enziu"
        description="Tiền hoàn được cộng vào đây. Bạn có thể dùng ví để thanh toán đơn đặt phòng hoặc yêu cầu rút về ngân hàng."
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
        <EmptyState
          icon={<WalletCards size={28} />}
          title="Ví chưa có giao dịch"
          description="Số dư chưa thể hiển thị. Hãy thử làm mới sau ít phút."
        />
      ) : (
        <>

      <section className="wallet-balance-grid">
        {cards.map(([label, value, Icon]) => (
          <article className="wallet-balance-card" key={label}>
            <div className="icon"><Icon size={21} /></div>
            <div><small>{label}</small><strong>{money(value)}</strong></div>
          </article>
        ))}
      </section>

      <section className="wallet-content-grid">
        <div className="wallet-panel">
          <div className="wallet-panel-header">
            <h2><History size={18} /> Lịch sử Ví Enziu</h2>
            <span>{transactions.length} giao dịch</span>
          </div>
          <div className="wallet-table-wrap">
            <table className="wallet-table">
              <thead><tr><th>Thời gian</th><th>Loại</th><th>Nội dung</th><th>Số tiền</th></tr></thead>
              <tbody>
                {visibleTransactions.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Thời gian">{dateTime(item.createdAt)}</td>
                    <td data-label="Loại"><strong>{transactionTypeLabel(item.type)}</strong></td>
                    <td data-label="Nội dung">{item.description || "Chưa có nội dung"}</td>
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
          <Pagination
            currentPage={transactionPage}
            totalPages={transactionPages}
            onPageChange={setTransactionPage}
            ariaLabel="Phân trang lịch sử Ví Enziu"
          />
        </div>

        <div className="wallet-side-stack">
          <aside className="wallet-panel">
            <div className="wallet-panel-header"><h2><Banknote size={18} /> Rút tiền về ngân hàng</h2></div>
            <form className="wallet-form" onSubmit={submitWithdrawal}>
              <label>Số tiền rút
                <input name="amount" type="number" min="10000" step="1000" value={form.amount} onChange={change} placeholder="100000" required />
              </label>
              <label>Ngân hàng
                <input name="bankName" value={form.bankName} onChange={change} placeholder="ACB" required />
              </label>
              <label>Mã BIN 6 số
                <input name="bankBin" value={form.bankBin} onChange={change} pattern="[0-9]{6}" placeholder="970416" required />
              </label>
              <label>Số tài khoản
                <input name="accountNumber" value={form.accountNumber} onChange={change} pattern="[0-9]{6,30}" required />
              </label>
              <label>Tên chủ tài khoản
                <input name="accountName" value={form.accountName} onChange={change} required />
              </label>
              <div className="wallet-helper">Tiền sẽ được khóa ngay khi gửi yêu cầu. Nếu bị từ chối, số dư tự động được hoàn lại.</div>
              <button className="wallet-primary-button" type="submit" disabled={submitting}>
                {submitting ? "Đang gửi..." : "Gửi yêu cầu rút"}
              </button>
            </form>
          </aside>
        </div>
      </section>

      <section className="wallet-panel">
        <div className="wallet-panel-header"><h2>Lịch sử yêu cầu rút</h2><span>{withdrawals.length} yêu cầu</span></div>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Ngày tạo</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {visibleWithdrawals.map((item) => (
                <tr key={item.id}>
                  <td data-label="Ngày tạo">{dateTime(item.requestedAt)}</td>
                  <td data-label="Số tiền"><strong>{money(item.amount)}</strong></td>
                  <td data-label="Ngân hàng">{item.bankName || "Chưa xác định"}<br /><small>{item.accountNumber || "Chưa có số tài khoản"}</small></td>
                  <td data-label="Trạng thái">
                    <StatusBadge
                      status={item.status}
                      label={withdrawalStatusLabel(item.status)}
                      size="sm"
                    />
                  </td>
                  <td data-label="Ghi chú">{item.reviewNote ?? item.failureReason ?? "—"}</td>
                </tr>
              ))}
              {!loading && withdrawals.length === 0 ? (
                <tr><td colSpan="5" className="wallet-empty">Chưa có yêu cầu rút tiền.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={withdrawalPage}
          totalPages={withdrawalPages}
          onPageChange={setWithdrawalPage}
          ariaLabel="Phân trang yêu cầu rút tiền"
        />
      </section>
        </>
      )}
    </main>
  );
}
