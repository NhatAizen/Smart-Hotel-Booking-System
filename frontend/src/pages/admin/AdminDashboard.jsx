import {
  ArrowRight,
  BadgeDollarSign,
  BedDouble,
  Building2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
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
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import "./SystemAdminDashboard.css";

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

function transactionLabel(type) {
  const labels = {
    PLATFORM_COMMISSION: "Hoa hồng từ booking",
    REFUND_DEBIT: "Hoàn hoa hồng",
    WITHDRAWAL: "Rút tiền",
    WITHDRAWAL_DEBIT: "Chi rút tiền",
  };
  return labels[type] ?? type ?? "Giao dịch";
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [financeWarning, setFinanceWarning] = useState("");

  const loadDashboard = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

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

    setPartners(partnerResult.status === "fulfilled" && Array.isArray(partnerResult.value) ? partnerResult.value : []);
    setHotels(hotelResult.status === "fulfilled" && Array.isArray(hotelResult.value) ? hotelResult.value : []);
    setRoomTypes(roomTypeResult.status === "fulfilled" && Array.isArray(roomTypeResult.value) ? roomTypeResult.value : []);
    setWithdrawals(withdrawalResult.status === "fulfilled" && Array.isArray(withdrawalResult.value) ? withdrawalResult.value : []);
    setWallet(walletResult.status === "fulfilled" ? walletResult.value : null);
    setTransactions(transactionResult.status === "fulfilled" && Array.isArray(transactionResult.value) ? transactionResult.value : []);
    setPaidPayments(paymentResult.status === "fulfilled" && Array.isArray(paymentResult.value) ? paymentResult.value : []);

    const criticalFailures = [partnerResult, hotelResult, roomTypeResult].filter((result) => result.status === "rejected");
    if (criticalFailures.length) {
      setError(
        criticalFailures[0].reason?.response?.data?.message
          ?? "Một số dữ liệu kiểm duyệt chưa tải được. Vui lòng thử lại.",
      );
    }

    const financeResults = [withdrawalResult, walletResult, transactionResult, paymentResult];
    if (financeResults.some((result) => result.status === "rejected")) {
      setFinanceWarning("Dữ liệu tài chính tạm thời chưa cập nhật đầy đủ.");
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useRealtimeRefresh("NOTIFICATION_CREATED", () => loadDashboard(true), { debounceMs: 180 });

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((item) => ["PENDING", "APPROVED", "PROCESSING"].includes(item.status)),
    [withdrawals],
  );

  const heldRevenue = useMemo(
    () => paidPayments.filter((item) => item.walletApplied && !item.revenueReleased),
    [paidPayments],
  );

  const queue = useMemo(() => [
    ...partners.map((item) => ({
      id: `partner-${item.id}`,
      kind: "Đối tác",
      title: item.legalName || item.fullName || "Hồ sơ đối tác",
      subtitle: item.applicantType === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân",
      time: item.createdAt,
      link: "/admin/partner-requests",
    })),
    ...hotels.map((hotel) => ({
      id: `hotel-${hotel.id}`,
      kind: "Khách sạn",
      title: hotel.name,
      subtitle: [hotel.district, hotel.city].filter(Boolean).join(" · "),
      time: hotel.createdAt,
      link: "/admin/hotels",
    })),
    ...roomTypes.map((roomType) => ({
      id: `room-${roomType.id}`,
      kind: "Loại phòng",
      title: roomType.name,
      subtitle: roomType.hotelName ?? "Chờ xét duyệt",
      time: roomType.submittedAt ?? roomType.updatedAt ?? roomType.createdAt,
      link: "/admin/room-types",
    })),
    ...pendingWithdrawals.map((item) => ({
      id: `withdraw-${item.id}`,
      kind: "Rút tiền",
      title: money(item.amount),
      subtitle: [item.bankName, item.accountName].filter(Boolean).join(" · "),
      time: item.requestedAt ?? item.createdAt,
      link: "/admin/wallet",
    })),
  ].sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0)).slice(0, 8), [hotels, partners, pendingWithdrawals, roomTypes]);

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const summaryCards = useMemo(() => [
    {
      label: "Đối tác chờ duyệt",
      value: partners.length,
      helper: partners.length ? "Hồ sơ cần kiểm tra" : "Không có hồ sơ tồn đọng",
      icon: ClipboardCheck,
      tone: "blue",
      to: "/admin/partner-requests",
    },
    {
      label: "Nội dung chờ duyệt",
      value: hotels.length + roomTypes.length,
      helper: `${hotels.length} khách sạn · ${roomTypes.length} loại phòng`,
      icon: Building2,
      tone: "violet",
      to: "/admin/hotels",
    },
    {
      label: "Tài chính cần xử lý",
      value: pendingWithdrawals.length + heldRevenue.length,
      helper: `${pendingWithdrawals.length} yêu cầu rút · ${heldRevenue.length} khoản đang giữ`,
      icon: WalletCards,
      tone: "orange",
      to: "/admin/wallet",
    },
    {
      label: "Hoa hồng khả dụng",
      value: money(wallet?.availableBalance),
      helper: `Tổng kiếm được ${money(wallet?.totalEarned)}`,
      icon: BadgeDollarSign,
      tone: "green",
      to: "/admin/wallet",
    },
  ], [heldRevenue.length, hotels.length, partners.length, pendingWithdrawals.length, roomTypes.length, wallet]);

  if (loading) return <Loading message="Đang tải tổng quan quản trị..." />;

  return (
    <main className="system-dashboard-v3">
      <section className="system-dashboard-v3-heading">
        <div>
          <span>QUẢN TRỊ HỆ THỐNG</span>
          <h1>Tổng quan EnziuRooms</h1>
          <p>Chỉ tập trung vào những việc System Admin cần xử lý: kiểm duyệt, tài chính và giao dịch nền tảng.</p>
        </div>
        <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing}>
          <RefreshCw size={18} className={refreshing ? "spin" : ""} />
          Làm mới
        </button>
      </section>

      <ErrorMessage message={error} onRetry={() => void loadDashboard(true)} />

      {financeWarning ? (
        <div className="system-dashboard-v3-warning">
          <WalletCards size={18} />
          <span>{financeWarning}</span>
        </div>
      ) : null}

      <section className="system-dashboard-v3-summary-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link to={card.to} className={`system-dashboard-v3-summary-card ${card.tone}`} key={card.label}>
              <span className="system-dashboard-v3-summary-icon"><Icon size={21} /></span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.helper}</p>
              </div>
              <ArrowRight size={18} />
            </Link>
          );
        })}
      </section>

      <section className="system-dashboard-v3-secondary-grid">
        <article>
          <span>Hoa hồng đang giữ</span>
          <strong>{money(wallet?.pendingBalance)}</strong>
        </article>
        <article>
          <span>Thanh toán đã ghi nhận</span>
          <strong>{paidPayments.length}</strong>
        </article>
        <article>
          <span>Giao dịch hoa hồng</span>
          <strong>{transactions.length}</strong>
        </article>
        <article>
          <span>Yêu cầu rút đang mở</span>
          <strong>{pendingWithdrawals.length}</strong>
        </article>
      </section>

      <section className="system-dashboard-v3-main-grid">
        <article className="system-dashboard-v3-panel">
          <header>
            <div>
              <span>VIỆC CẦN XỬ LÝ</span>
              <h2>Hàng đợi kiểm duyệt</h2>
            </div>
            <strong>{partners.length + hotels.length + roomTypes.length + pendingWithdrawals.length} việc</strong>
          </header>

          {queue.length === 0 ? (
            <div className="system-dashboard-v3-empty">
              <ShieldCheck size={38} />
              <h3>Không có công việc tồn đọng</h3>
              <p>Các yêu cầu hiện tại đã được xử lý.</p>
            </div>
          ) : (
            <div className="system-dashboard-v3-queue">
              {queue.map((item) => (
                <Link to={item.link} key={item.id}>
                  <span className="system-dashboard-v3-kind">{item.kind}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle || "Đang chờ xử lý"}</small>
                  </div>
                  <time>{dateTime(item.time)}</time>
                  <ArrowRight size={17} />
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="system-dashboard-v3-panel">
          <header>
            <div>
              <span>TÀI CHÍNH NỀN TẢNG</span>
              <h2>Giao dịch gần đây</h2>
            </div>
            <Link to="/admin/wallet">Xem ví</Link>
          </header>

          {recentTransactions.length === 0 ? (
            <div className="system-dashboard-v3-empty compact">
              <TrendingUp size={34} />
              <p>Chưa có giao dịch tài chính.</p>
            </div>
          ) : (
            <div className="system-dashboard-v3-transactions">
              {recentTransactions.map((item) => (
                <div key={item.id}>
                  <span className="transaction-icon"><BadgeDollarSign size={17} /></span>
                  <div>
                    <strong>{item.description ?? transactionLabel(item.type)}</strong>
                    <small>{dateTime(item.createdAt)} · {transactionLabel(item.type)}</small>
                  </div>
                  <strong className={Number(item.amount) >= 0 ? "positive" : "negative"}>
                    {money(item.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="system-dashboard-v3-actions">
        <Link to="/admin/users"><Users size={20} /><div><strong>Tài khoản</strong><span>Quản lý Customer và Hotel Admin</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/partner-requests"><ClipboardCheck size={20} /><div><strong>Duyệt đối tác</strong><span>{partners.length} hồ sơ đang chờ</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/hotels"><Building2 size={20} /><div><strong>Duyệt khách sạn</strong><span>{hotels.length} khách sạn đang chờ</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/room-types"><BedDouble size={20} /><div><strong>Duyệt loại phòng</strong><span>{roomTypes.length} loại phòng đang chờ</span></div><ArrowRight size={18} /></Link>
      </section>
    </main>
  );
}
