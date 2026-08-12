import {
  ArrowRight,
  BadgeDollarSign,
  BedDouble,
  Building2,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  getPendingHotels,
  getPendingPartnerRequests,
  getPendingRoomTypes,
} from "../../services/adminService";
import {
  getPaymentsByStatus,
  getPlatformWallet,
  getPlatformWalletTransactions,
  getWithdrawals,
} from "../../services/paymentService";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminDashboard() {
  const [partners, setPartners] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [paidPayments, setPaidPayments] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [financeWarning, setFinanceWarning] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setFinanceWarning("");

    const [
      partnerResult,
      hotelResult,
      roomTypeResult,
      withdrawalResult,
      walletResult,
      transactionResult,
      paymentResult,
    ] = await Promise.allSettled([
      getPendingPartnerRequests(),
      getPendingHotels(),
      getPendingRoomTypes(),
      getWithdrawals(""),
      getPlatformWallet(),
      getPlatformWalletTransactions(),
      getPaymentsByStatus("PAID"),
    ]);

    const criticalFailures = [partnerResult, hotelResult, roomTypeResult]
      .filter((result) => result.status === "rejected");

    if (partnerResult.status === "fulfilled") {
      setPartners(Array.isArray(partnerResult.value) ? partnerResult.value : []);
    } else {
      setPartners([]);
    }

    if (hotelResult.status === "fulfilled") {
      setHotels(Array.isArray(hotelResult.value) ? hotelResult.value : []);
    } else {
      setHotels([]);
    }

    if (roomTypeResult.status === "fulfilled") {
      setRoomTypes(Array.isArray(roomTypeResult.value) ? roomTypeResult.value : []);
    } else {
      setRoomTypes([]);
    }

    if (withdrawalResult.status === "fulfilled") {
      setWithdrawals(Array.isArray(withdrawalResult.value) ? withdrawalResult.value : []);
    } else {
      setWithdrawals([]);
    }

    if (walletResult.status === "fulfilled") {
      setWallet(walletResult.value);
    } else {
      setWallet(null);
    }

    if (transactionResult.status === "fulfilled") {
      setTransactions(Array.isArray(transactionResult.value) ? transactionResult.value : []);
    } else {
      setTransactions([]);
    }

    if (paymentResult.status === "fulfilled") {
      setPaidPayments(Array.isArray(paymentResult.value) ? paymentResult.value : []);
    } else {
      setPaidPayments([]);
    }

    const financeResults = [withdrawalResult, walletResult, transactionResult, paymentResult];
    if (financeResults.some((result) => result.status === "rejected")) {
      setFinanceWarning(
        "Payment Service đang tạm thời không phản hồi. Các mục duyệt vẫn hoạt động; dữ liệu ví/đối soát sẽ tự hiển thị lại khi Payment Service healthy.",
      );
    }

    if (criticalFailures.length > 0) {
      const first = criticalFailures[0];
      setError(
        first.reason?.response?.data?.message
          ?? "Một phần dữ liệu kiểm duyệt chưa tải được. Hãy thử lại.",
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((item) => ["PENDING", "APPROVED", "PROCESSING"].includes(item.status)),
    [withdrawals],
  );

  const heldRevenue = useMemo(
    () => paidPayments.filter((item) => item.walletApplied && !item.revenueReleased),
    [paidPayments],
  );

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const queue = useMemo(() => [
    ...partners.slice(0, 3).map((item) => ({
      id: `partner-${item.id}`,
      kind: "Đối tác",
      title: item.legalName,
      subtitle: item.applicantType === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân",
      time: item.createdAt,
      link: "/admin/partner-requests",
    })),
    ...hotels.slice(0, 3).map((hotel) => ({
      id: `hotel-${hotel.id}`,
      kind: "Khách sạn",
      title: hotel.name,
      subtitle: [hotel.city, hotel.district].filter(Boolean).join(" · "),
      time: hotel.createdAt,
      link: "/admin/hotels",
    })),
    ...roomTypes.slice(0, 3).map((roomType) => ({
      id: `room-type-${roomType.id}`,
      kind: "Loại phòng",
      title: roomType.name,
      subtitle: roomType.hotelName ?? "Chờ xét duyệt",
      time: roomType.submittedAt ?? roomType.updatedAt ?? roomType.createdAt,
      link: "/admin/room-types",
    })),
    ...pendingWithdrawals.slice(0, 3).map((item) => ({
      id: `withdraw-${item.id}`,
      kind: "Rút tiền",
      title: money(item.amount),
      subtitle: `${item.bankName} · ${item.accountName}`,
      time: item.requestedAt,
      link: "/admin/wallet",
    })),
  ].sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0)).slice(0, 7), [hotels, partners, pendingWithdrawals, roomTypes]);

  if (loading) return <Loading message="Đang tổng hợp dữ liệu toàn hệ thống..." />;

  return (
    <main className="system-dashboard-v2">
      <section className="system-dashboard-heading">
        <div>
          <span>SYSTEM CONTROL CENTER</span>
          <h1>Tổng quan hệ thống</h1>
          <p>Kiểm duyệt đối tác, khách sạn, tài chính và các tác vụ cần xử lý trên EnziuRooms.</p>
        </div>
        <button type="button" onClick={() => void loadDashboard()}>
          <RefreshCw size={18} /> Làm mới dữ liệu
        </button>
      </section>

      <ErrorMessage message={error} onRetry={() => void loadDashboard()} />

      {financeWarning ? (
        <div className="system-dashboard-service-warning" role="status">
          <WalletCards size={18} />
          <span>{financeWarning}</span>
          <button type="button" onClick={() => void loadDashboard()}>Thử lại tài chính</button>
        </div>
      ) : null}

      <section className="system-dashboard-stat-grid">
        <Link to="/admin/partner-requests" className="system-dashboard-stat-card blue">
          <span><ClipboardCheck size={22} /></span>
          <div><small>Đối tác chờ duyệt</small><strong>{partners.length}</strong><em>Hồ sơ cần kiểm tra</em></div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/admin/hotels" className="system-dashboard-stat-card violet">
          <span><Building2 size={22} /></span>
          <div><small>Khách sạn chờ duyệt</small><strong>{hotels.length}</strong><em>Đăng ký đang chờ xử lý</em></div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/admin/wallet" className="system-dashboard-stat-card orange">
          <span><WalletCards size={22} /></span>
          <div><small>Yêu cầu rút cần xử lý</small><strong>{pendingWithdrawals.length}</strong><em>Duyệt / đối soát / chuyển tiền</em></div>
          <ArrowRight size={18} />
        </Link>
        <article className="system-dashboard-stat-card green">
          <span><BadgeDollarSign size={22} /></span>
          <div><small>Hoa hồng khả dụng</small><strong className="money">{money(wallet?.availableBalance)}</strong><em>Tổng kiếm được: {money(wallet?.totalEarned)}</em></div>
        </article>
      </section>

      <section className="system-dashboard-finance-strip">
        <div><span>Hoa hồng đang giữ</span><strong>{money(wallet?.pendingBalance)}</strong></div>
        <div><span>Doanh thu khách sạn chờ giải ngân</span><strong>{heldRevenue.length} khoản</strong></div>
        <div><span>Thanh toán PAID</span><strong>{paidPayments.length}</strong></div>
        <div><span>Giao dịch hoa hồng</span><strong>{transactions.length}</strong></div>
      </section>

      <section className="system-dashboard-grid">
        <article className="system-dashboard-panel queue-panel">
          <header>
            <div><span>HÀNG ĐỢI XỬ LÝ</span><h2>Công việc cần chú ý</h2></div>
            <strong>{partners.length + hotels.length + roomTypes.length + pendingWithdrawals.length} việc</strong>
          </header>

          {queue.length === 0 ? (
            <div className="system-dashboard-empty">
              <ShieldCheck size={40} />
              <h3>Không có công việc tồn đọng</h3>
              <p>Các yêu cầu hiện tại đã được xử lý.</p>
            </div>
          ) : (
            <div className="system-dashboard-queue-list">
              {queue.map((item) => (
                <Link key={item.id} to={item.link}>
                  <span className="queue-kind">{item.kind}</span>
                  <div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
                  <time>{dateTime(item.time)}</time>
                  <ArrowRight size={17} />
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="system-dashboard-panel finance-panel">
          <header>
            <div><span>TÀI CHÍNH NỀN TẢNG</span><h2>Giao dịch hoa hồng gần đây</h2></div>
            <Link to="/admin/wallet">Mở ví</Link>
          </header>

          {recentTransactions.length === 0 ? (
            <div className="system-dashboard-empty compact"><TrendingUp size={34} /><p>Chưa có giao dịch tài chính.</p></div>
          ) : (
            <div className="system-dashboard-transaction-list">
              {recentTransactions.map((item) => (
                <div key={item.id}>
                  <span className="transaction-icon"><BadgeDollarSign size={17} /></span>
                  <div><strong>{item.description ?? item.type}</strong><small>{dateTime(item.createdAt)} · {item.type}</small></div>
                  <strong className={Number(item.amount) >= 0 ? "positive" : "negative"}>{money(item.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="system-dashboard-action-grid">
        <Link to="/admin/partner-requests"><ClipboardCheck size={20} /><div><strong>Duyệt đối tác</strong><span>{partners.length} hồ sơ đang chờ</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/hotels"><Building2 size={20} /><div><strong>Duyệt khách sạn</strong><span>{hotels.length} khách sạn đang chờ</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/room-types"><BedDouble size={20} /><div><strong>Duyệt loại phòng</strong><span>{roomTypes.length} loại phòng đang chờ</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/wallet"><Clock3 size={20} /><div><strong>Đối soát & giải ngân</strong><span>{pendingWithdrawals.length + heldRevenue.length} khoản cần chú ý</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/notifications"><ShieldCheck size={20} /><div><strong>Thông báo hệ thống</strong><span>Xem các sự kiện cần xử lý</span></div><ArrowRight size={18} /></Link>
      </section>
    </main>
  );
}
