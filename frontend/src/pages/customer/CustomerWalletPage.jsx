import {
  ArrowDownToLine,
  Banknote,
  History,
  LockKeyhole,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  createWithdrawal,
  getMyWallet,
  getMyWalletTransactions,
  getMyWithdrawals,
} from "../../services/paymentService";
import "../shared/WalletPage.css";

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

const TYPE_LABELS = {
  CUSTOMER_REFUND_CREDIT: "Hoàn tiền",
  CUSTOMER_PAYMENT_DEBIT: "Thanh toán booking",
  WITHDRAWAL_HOLD: "Tạm khóa chờ rút",
  WITHDRAWAL_RELEASED: "Hoàn tiền khóa",
  WITHDRAWAL_PAID: "Đã rút về ngân hàng",
};

export default function CustomerWalletPage() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
      setMessage("Đã gửi yêu cầu rút tiền. System Admin sẽ kiểm tra và xử lý.");
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

  return (
    <main className="wallet-page customer-wallet-page">
      <header className="wallet-page-heading">
        <div>
          <span className="wallet-page-kicker">VÍ KHÁCH HÀNG</span>
          <h1>Ví Enziu</h1>
          <p>Tiền hoàn được cộng vào đây. Bạn có thể dùng ví để thanh toán booking hoặc yêu cầu rút về ngân hàng.</p>
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
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.createdAt)}</td>
                    <td><strong>{TYPE_LABELS[item.type] ?? item.type}</strong></td>
                    <td>{item.description}</td>
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
              {withdrawals.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.requestedAt)}</td>
                  <td><strong>{money(item.amount)}</strong></td>
                  <td>{item.bankName}<br /><small>{item.accountNumber}</small></td>
                  <td><span className={`wallet-status ${String(item.status).toLowerCase()}`}>{item.status}</span></td>
                  <td>{item.reviewNote ?? item.failureReason ?? "—"}</td>
                </tr>
              ))}
              {!loading && withdrawals.length === 0 ? (
                <tr><td colSpan="5" className="wallet-empty">Chưa có yêu cầu rút tiền.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
