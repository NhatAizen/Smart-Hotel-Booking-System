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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
} from "../../components/ui";
import {
  getPendingHotels,
  getPendingPartnerRequests,
  getPendingRoomTypes,
} from "../../services/adminService";
import {
  getPaymentsByStatus,
  getAdminRefundRequests,
  getPlatformWallet,
  getPlatformWalletTransactions,
  getWithdrawals,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  normalizeEnum,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/presentation";
import "./SystemAdminDashboard.css";

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
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function transactionLabel(type) {
  const labels = {
    PLATFORM_COMMISSION: "Hoa hồng nền tảng",
    REFUND_DEBIT: "Hoàn tiền",
    WITHDRAWAL: "Rút tiền",
    WITHDRAWAL_DEBIT: "Chi rút tiền",
  };
  const normalized = normalizeEnum(type);
  return labels[normalized]
    ?? TRANSACTION_TYPE_LABELS[normalized]
    ?? "Giao dịch chưa phân loại";
}

function transactionAmountTone(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return amount >= 0 ? "positive" : "negative";
}

function applicantTypeLabel(value) {
  const normalized = normalizeEnum(value);
  if (normalized === "BUSINESS") return "Doanh nghiệp";
  if (normalized === "INDIVIDUAL" || normalized === "PERSONAL") return "Cá nhân";
  return "Chưa xác định loại hồ sơ";
}

function refundNeedsAdminAction(item) {
  if (!["APPROVED", "PARTIALLY_COMPLETED"].includes(normalizeEnum(item?.status))) {
    return false;
  }
  const platformPending = Number(item?.platformHeldAmount ?? 0) > 0
    && !item?.platformRefundCompleted;
  const reconciliationPending = Number(item?.manualReconciliationAmount ?? 0) > 0
    && !item?.manualReconciliationCompleted;
  return platformPending || reconciliationPending;
}

function refundActionSummary(item) {
  const actions = [];
  if (Number(item?.platformHeldAmount ?? 0) > 0 && !item?.platformRefundCompleted) {
    actions.push(`Hoàn phần EnziuRooms ${money(item.platformHeldAmount)}`);
  }
  if (Number(item?.manualReconciliationAmount ?? 0) > 0 && !item?.manualReconciliationCompleted) {
    actions.push(`Đối soát ${money(item.manualReconciliationAmount)}`);
  }
  return actions.join(" · ") || "Cần kiểm tra yêu cầu hoàn tiền";
}

export default function AdminDashboard() {
  const [partners, setPartners] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [paidPayments, setPaidPayments] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [financeWarning, setFinanceWarning] = useState("");
  const loadRequestRef = useRef(0);
  const [sourceAvailable, setSourceAvailable] = useState({
    partners: true,
    hotels: true,
    roomTypes: true,
    withdrawals: true,
    refunds: true,
    wallet: true,
    transactions: true,
    payments: true,
  });

  const loadDashboard = useCallback(async (silent = false) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");
    setFinanceWarning("");

    const [
      partnerResult,
      hotelResult,
      roomTypeResult,
      withdrawalResult,
      refundResult,
      walletResult,
      transactionResult,
      paymentResult,
    ] = await Promise.allSettled([
      getPendingPartnerRequests(),
      getPendingHotels(),
      getPendingRoomTypes(),
      getWithdrawals(""),
      getAdminRefundRequests(),
      getPlatformWallet(),
      getPlatformWalletTransactions(),
      getPaymentsByStatus("PAID"),
    ]);

    if (loadRequestRef.current !== requestId) return;

    setPartners(partnerResult.status === "fulfilled" && Array.isArray(partnerResult.value) ? partnerResult.value : []);
    setHotels(hotelResult.status === "fulfilled" && Array.isArray(hotelResult.value) ? hotelResult.value : []);
    setRoomTypes(roomTypeResult.status === "fulfilled" && Array.isArray(roomTypeResult.value) ? roomTypeResult.value : []);
    setWithdrawals(withdrawalResult.status === "fulfilled" && Array.isArray(withdrawalResult.value) ? withdrawalResult.value : []);
    setRefundRequests(refundResult.status === "fulfilled" && Array.isArray(refundResult.value) ? refundResult.value : []);
    setWallet(walletResult.status === "fulfilled" ? walletResult.value : null);
    setTransactions(transactionResult.status === "fulfilled" && Array.isArray(transactionResult.value) ? transactionResult.value : []);
    setPaidPayments(paymentResult.status === "fulfilled" && Array.isArray(paymentResult.value) ? paymentResult.value : []);
    setSourceAvailable({
      partners: partnerResult.status === "fulfilled",
      hotels: hotelResult.status === "fulfilled",
      roomTypes: roomTypeResult.status === "fulfilled",
      withdrawals: withdrawalResult.status === "fulfilled",
      refunds: refundResult.status === "fulfilled",
      wallet: walletResult.status === "fulfilled",
      transactions: transactionResult.status === "fulfilled",
      payments: paymentResult.status === "fulfilled",
    });

    const criticalFailures = [partnerResult, hotelResult, roomTypeResult].filter((result) => result.status === "rejected");
    if (criticalFailures.length) {
      setError(
        criticalFailures[0].reason?.response?.data?.message
          ?? "Một số dữ liệu kiểm duyệt chưa tải được. Vui lòng thử lại.",
      );
    }

    const financeResults = [withdrawalResult, refundResult, walletResult, transactionResult, paymentResult];
    if (financeResults.some((result) => result.status === "rejected")) {
      setFinanceWarning("Dữ liệu tài chính tạm thời chưa cập nhật đầy đủ.");
    }

    if (loadRequestRef.current === requestId) {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadDashboard]);

  useRealtimeRefresh("NOTIFICATION_CREATED", () => loadDashboard(true), { debounceMs: 180 });

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((item) =>
      ["PENDING", "APPROVED", "PROCESSING"].includes(normalizeEnum(item.status)),
    ),
    [withdrawals],
  );

  const actionableRefunds = useMemo(
    () => refundRequests.filter(refundNeedsAdminAction),
    [refundRequests],
  );

  const heldRevenue = useMemo(
    () => paidPayments.filter((item) => item.walletApplied && !item.revenueReleased),
    [paidPayments],
  );

  const financeSourcesAvailable = sourceAvailable.withdrawals
    && sourceAvailable.refunds
    && sourceAvailable.payments;
  const queueSourcesAvailable = sourceAvailable.partners
    && sourceAvailable.hotels
    && sourceAvailable.roomTypes
    && financeSourcesAvailable;
  const financeActionCount = pendingWithdrawals.length
    + actionableRefunds.length
    + heldRevenue.length;
  const totalQueueCount = partners.length
    + hotels.length
    + roomTypes.length
    + financeActionCount;

  const queue = useMemo(() => [
    ...partners.map((item) => ({
      id: `partner-${item.id}`,
      kind: "Đối tác",
      title: item.legalName || item.fullName || "Hồ sơ đối tác",
      subtitle: applicantTypeLabel(item.applicantType),
      time: item.createdAt,
      link: "/admin/partner-requests",
    })),
    ...hotels.map((hotel) => ({
      id: `hotel-${hotel.id}`,
      kind: "Khách sạn",
      title: hotel.name || "Khách sạn chưa cập nhật tên",
      subtitle: [hotel.district, hotel.city].filter(Boolean).join(" · ") || "Chưa cập nhật địa điểm",
      time: hotel.createdAt,
      link: "/admin/hotels",
    })),
    ...roomTypes.map((roomType) => ({
      id: `room-${roomType.id}`,
      kind: "Loại phòng",
      title: roomType.name || "Loại phòng chưa cập nhật tên",
      subtitle: roomType.hotelName || "Chưa có tên khách sạn",
      time: roomType.submittedAt ?? roomType.updatedAt ?? roomType.createdAt,
      link: "/admin/room-types",
    })),
    ...pendingWithdrawals.map((item) => ({
      id: `withdraw-${item.id}`,
      kind: "Rút tiền",
      title: money(item.amount),
      subtitle: [item.bankName, item.accountName].filter(Boolean).join(" · ") || "Chưa cập nhật thông tin nhận tiền",
      time: item.requestedAt ?? item.createdAt,
      link: "/admin/wallet",
    })),
    ...heldRevenue.map((item) => ({
      id: `revenue-${item.id}`,
      kind: "Giải ngân",
      title: money(item.hotelNetAmount),
      subtitle: item.transactionCode
        ? `Giao dịch ${item.transactionCode}`
        : "Khoản doanh thu đang giữ",
      time: item.paidAt ?? item.updatedAt ?? item.createdAt,
      link: "/admin/wallet",
    })),
    ...actionableRefunds.map((item) => ({
      id: `refund-${item.id}`,
      kind: "Hoàn tiền",
      title: item.bookingCode ? `Đơn ${item.bookingCode}` : "Yêu cầu hoàn tiền",
      subtitle: refundActionSummary(item),
      time: item.updatedAt ?? item.requestedAt,
      link: "/admin/wallet",
    })),
  ].sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0)).slice(0, 8), [
    actionableRefunds,
    heldRevenue,
    hotels,
    partners,
    pendingWithdrawals,
    roomTypes,
  ]);

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const summaryCards = useMemo(() => [
    {
      label: "Đối tác chờ duyệt",
      value: sourceAvailable.partners ? partners.length : "—",
      helper: sourceAvailable.partners
        ? (partners.length ? "Hồ sơ cần kiểm tra" : "Không có hồ sơ tồn đọng")
        : "Chưa thể tải dữ liệu",
      icon: ClipboardCheck,
      tone: "info",
      to: "/admin/partner-requests",
    },
    {
      label: "Khách sạn chờ duyệt",
      value: sourceAvailable.hotels ? hotels.length : "—",
      helper: sourceAvailable.hotels
        ? (hotels.length ? "Hồ sơ khách sạn cần kiểm tra" : "Không có khách sạn tồn đọng")
        : "Chưa thể tải dữ liệu",
      icon: Building2,
      tone: "violet",
      to: "/admin/hotels",
    },
    {
      label: "Loại phòng chờ duyệt",
      value: sourceAvailable.roomTypes ? roomTypes.length : "—",
      helper: sourceAvailable.roomTypes
        ? (roomTypes.length ? "Nội dung phòng cần kiểm tra" : "Không có loại phòng tồn đọng")
        : "Chưa thể tải dữ liệu",
      icon: BedDouble,
      tone: "warning",
      to: "/admin/room-types",
    },
    {
      label: "Tài chính cần xử lý",
      value: financeSourcesAvailable ? financeActionCount : "—",
      helper: financeSourcesAvailable
        ? `${pendingWithdrawals.length} yêu cầu rút · ${actionableRefunds.length} hoàn tiền · ${heldRevenue.length} khoản đang giữ`
        : "Dữ liệu tài chính chưa đầy đủ",
      icon: WalletCards,
      tone: "danger",
      to: "/admin/wallet",
    },
  ], [
    actionableRefunds.length,
    financeActionCount,
    financeSourcesAvailable,
    heldRevenue.length,
    hotels.length,
    partners.length,
    pendingWithdrawals.length,
    roomTypes.length,
    sourceAvailable.hotels,
    sourceAvailable.partners,
    sourceAvailable.roomTypes,
  ]);

  if (loading) return <Loading message="Đang tải tổng quan quản trị..." />;

  const queueCountLabel = queueSourcesAvailable
    ? `${totalQueueCount} việc`
    : totalQueueCount > 0
      ? `${totalQueueCount}+ việc đã tải`
      : "Chưa đủ dữ liệu";

  return (
    <main className="system-dashboard-v3">
      <PageHeader
        className="system-dashboard-v3-heading"
        eyebrow="Quản trị hệ thống"
        title="Tổng quan EnziuRooms"
        description="Ưu tiên các công việc kiểm duyệt, hoàn tiền, đối soát và giao dịch nền tảng cần xử lý."
        icon={<ShieldCheck size={22} />}
        actions={(
          <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing}>
            <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            Làm mới
          </button>
        )}
      />

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
            <Link to={card.to} className="system-dashboard-v3-stat-link" key={card.label}>
              <StatCard
                className="system-dashboard-v3-stat"
                label={card.label}
                value={card.value}
                hint={card.helper}
                icon={<Icon size={21} />}
                tone={card.tone}
              />
            </Link>
          );
        })}
      </section>

      <section className="system-dashboard-v3-secondary-grid">
        <article>
          <span>Hoa hồng khả dụng</span>
          <strong>{sourceAvailable.wallet ? money(wallet?.availableBalance) : "—"}</strong>
          <small>
            {sourceAvailable.wallet
              ? `Tổng tích lũy ${money(wallet?.totalEarned)}`
              : "Chưa thể tải dữ liệu ví"}
          </small>
        </article>
        <article>
          <span>Hoa hồng đang giữ</span>
          <strong>{sourceAvailable.wallet ? money(wallet?.pendingBalance) : "—"}</strong>
        </article>
        <article>
          <span>Thanh toán đã ghi nhận</span>
          <strong>{sourceAvailable.payments ? paidPayments.length : "—"}</strong>
        </article>
        <article>
          <span>Giao dịch hoa hồng</span>
          <strong>{sourceAvailable.transactions ? transactions.length : "—"}</strong>
        </article>
      </section>

      <section className="system-dashboard-v3-main-grid">
        <Panel
          className="system-dashboard-v3-panel"
          title="Hàng đợi cần xử lý"
          description="Kiểm duyệt và tài chính được sắp theo thời gian cập nhật"
          icon={<ClipboardCheck size={20} />}
          actions={<strong>{queueCountLabel}</strong>}
          padding="none"
        >
          {queue.length === 0 ? (
            <EmptyState
              className="system-dashboard-v3-empty"
              icon={<ShieldCheck size={34} />}
              title={queueSourcesAvailable
                ? "Không có công việc tồn đọng"
                : "Chưa thể tổng hợp đầy đủ hàng đợi"}
              description={queueSourcesAvailable
                ? "Các yêu cầu hiện tại đã được xử lý."
                : "Một số nguồn dữ liệu chưa tải được. Hãy thử làm mới."}
              compact
            />
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
        </Panel>

        <Panel
          className="system-dashboard-v3-panel"
          title="Giao dịch gần đây"
          description="Dòng tiền và hoa hồng của nền tảng"
          icon={<BadgeDollarSign size={20} />}
          actions={<Link to="/admin/wallet">Xem ví</Link>}
          padding="none"
        >
          {recentTransactions.length === 0 ? (
            <EmptyState
              className="system-dashboard-v3-empty compact"
              icon={<TrendingUp size={32} />}
              title={sourceAvailable.transactions
                ? "Chưa có giao dịch tài chính"
                : "Chưa thể tải giao dịch"}
              description={sourceAvailable.transactions
                ? "Giao dịch mới sẽ xuất hiện tại đây."
                : "Hãy thử làm mới khi kết nối ổn định."}
              compact
            />
          ) : (
            <div className="system-dashboard-v3-transactions">
              {recentTransactions.map((item) => (
                <div key={item.id}>
                  <span className="transaction-icon"><BadgeDollarSign size={17} /></span>
                  <div>
                    <strong>{transactionLabel(item.type)}</strong>
                    <small>{dateTime(item.createdAt)}</small>
                  </div>
                  <strong className={transactionAmountTone(item.amount)}>
                    {money(item.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="system-dashboard-v3-actions">
        <Link to="/admin/users"><Users size={20} /><div><strong>Tài khoản</strong><span>Quản lý khách hàng và đối tác khách sạn</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/partner-requests"><ClipboardCheck size={20} /><div><strong>Duyệt đối tác</strong><span>{sourceAvailable.partners ? `${partners.length} hồ sơ đang chờ` : "Chưa thể tải số liệu"}</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/hotels"><Building2 size={20} /><div><strong>Duyệt khách sạn</strong><span>{sourceAvailable.hotels ? `${hotels.length} khách sạn đang chờ` : "Chưa thể tải số liệu"}</span></div><ArrowRight size={18} /></Link>
        <Link to="/admin/room-types"><BedDouble size={20} /><div><strong>Duyệt loại phòng</strong><span>{sourceAvailable.roomTypes ? `${roomTypes.length} loại phòng đang chờ` : "Chưa thể tải số liệu"}</span></div><ArrowRight size={18} /></Link>
      </section>
    </main>
  );
}
