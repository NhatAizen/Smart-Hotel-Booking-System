import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  BedDouble,
  Bell,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Flag,
  Gift,
  Landmark,
  MessageSquareWarning,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, PageHeader, Panel, StatCard } from "../../components/ui";
import {
  getPendingHotels,
  getPendingPartnerRequests,
  getPendingRoomTypes,
} from "../../services/adminService";
import { getSystemBookings } from "../../services/bookingService";
import { getAdminComplaints } from "../../services/complaintService";
import { getHotels } from "../../services/hotelService";
import {
  getAdminRefundRequests,
  getPaymentsByStatus,
  getWithdrawals,
} from "../../services/paymentService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import { normalizeEnum } from "../../utils/presentation";
import { exportCsv, exportExcel } from "../../utils/reportExport";
import "./SystemAdminDashboard.css";

const RANGE_OPTIONS = [
  { key: "7D", label: "7 ngày", amount: 7, unit: "day" },
  { key: "30D", label: "30 ngày", amount: 30, unit: "day" },
  { key: "3M", label: "3 tháng", amount: 3, unit: "month" },
  { key: "6M", label: "6 tháng", amount: 6, unit: "month" },
  { key: "1Y", label: "1 năm", amount: 12, unit: "month" },
];

const SUCCESS_BOOKING_STATUSES = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]);
const OPEN_COMPLAINT_STATUSES = new Set([
  "SUBMITTED",
  "UNDER_REVIEW",
  "WAITING_FOR_HOTEL",
  "WAITING_FOR_CUSTOMER",
  "RESOLVING",
]);
const PENDING_WITHDRAWAL_STATUSES = new Set(["PENDING", "UNDER_REVIEW", "APPROVED"]);

function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return `${Math.round(number(value)).toLocaleString("vi-VN")} ₫`;
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

function paymentDate(payment) {
  return payment?.paidAt ?? payment?.updatedAt ?? payment?.createdAt;
}

function completedRefundAmount(refund) {
  return (
    (refund?.platformRefundCompleted ? number(refund.platformHeldAmount) : 0)
    + (refund?.hotelRefundCompleted ? number(refund.hotelDirectAmount) : 0)
    + (refund?.manualReconciliationCompleted ? number(refund.manualReconciliationAmount) : 0)
  );
}

function refundNeedsAction(refund) {
  const status = normalizeEnum(refund?.status);
  if (!["APPROVED", "PARTIALLY_COMPLETED"].includes(status)) return false;
  return (
    (number(refund?.platformHeldAmount) > 0 && !refund?.platformRefundCompleted)
    || (number(refund?.manualReconciliationAmount) > 0 && !refund?.manualReconciliationCompleted)
  );
}

function periodStart(rangeKey) {
  const option = RANGE_OPTIONS.find((item) => item.key === rangeKey) ?? RANGE_OPTIONS[1];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (option.unit === "month") start.setMonth(start.getMonth() - option.amount + 1, 1);
  else start.setDate(start.getDate() - option.amount + 1);
  return start;
}

function bucketConfig(rangeKey) {
  const option = RANGE_OPTIONS.find((item) => item.key === rangeKey) ?? RANGE_OPTIONS[1];
  const buckets = [];
  const now = new Date();
  if (option.unit === "month") {
    for (let offset = option.amount - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("vi-VN", { month: "short", year: option.amount > 6 ? "2-digit" : undefined }).format(date),
        commission: 0,
        gmv: 0,
        bookings: 0,
      });
    }
  } else {
    for (let offset = option.amount - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date),
        commission: 0,
        gmv: 0,
        bookings: 0,
      });
    }
  }
  return { option, buckets };
}

function itemBucketKey(value, unit) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return unit === "month" ? month : `${month}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildTrend(payments, bookings, rangeKey, hotelId) {
  const { option, buckets } = bucketConfig(rangeKey);
  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const matchesHotel = (item) => hotelId === "ALL" || String(item?.hotelId) === String(hotelId);

  payments.filter(matchesHotel).forEach((payment) => {
    const bucket = index.get(itemBucketKey(paymentDate(payment), option.unit));
    if (!bucket) return;
    bucket.commission += number(payment?.commissionAmount);
    bucket.gmv += number(payment?.amount);
  });

  bookings
    .filter((booking) => matchesHotel(booking) && SUCCESS_BOOKING_STATUSES.has(normalizeEnum(booking?.status)))
    .forEach((booking) => {
      const bucket = index.get(itemBucketKey(booking?.createdAt, option.unit));
      if (bucket) bucket.bookings += 1;
    });

  return buckets;
}

function GrowthChart({ buckets }) {
  const width = 900;
  const height = 270;
  const padding = { left: 30, right: 30, top: 20, bottom: 28 };
  const maxCommission = Math.max(...buckets.map((item) => item.commission), 1);
  const maxGmv = Math.max(...buckets.map((item) => item.gmv), 1);
  const x = (index) => padding.left + (buckets.length === 1 ? (width - padding.left - padding.right) / 2 : index * ((width - padding.left - padding.right) / (buckets.length - 1)));
  const y = (value, max) => height - padding.bottom - ((value / max) * (height - padding.top - padding.bottom));
  const points = (key, max) => buckets.map((item, index) => `${x(index)},${y(item[key], max)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(buckets.length / 7));
  const hasData = buckets.some((item) => item.commission > 0 || item.gmv > 0);

  if (!hasData) {
    return (
      <EmptyState
        className="system-dashboard-v4-empty"
        icon={<BarChart3 size={30} />}
        title="Chưa có số liệu trong kỳ"
        description="Hãy chọn khách sạn hoặc khoảng thời gian khác để xem tăng trưởng."
        compact
      />
    );
  }

  return (
    <div className="system-dashboard-v4-chart" role="img" aria-label="Biểu đồ doanh thu hệ thống và tổng giá trị giao dịch">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="adminRevenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line key={ratio} x1={padding.left} x2={width - padding.right} y1={padding.top + ratio * (height - padding.top - padding.bottom)} y2={padding.top + ratio * (height - padding.top - padding.bottom)} />
        ))}
        <polygon
          className="revenue-area"
          points={`${padding.left},${height - padding.bottom} ${points("commission", maxCommission)} ${width - padding.right},${height - padding.bottom}`}
        />
        <polyline className="commission" points={points("commission", maxCommission)} />
        <polyline className="gmv" points={points("gmv", maxGmv)} />
        {buckets.map((bucket, index) => (
          <g key={bucket.key}>
            <circle className="commission" cx={x(index)} cy={y(bucket.commission, maxCommission)} r="4">
              <title>{`${bucket.label}: Doanh thu ${money(bucket.commission)} · Giá trị giao dịch ${money(bucket.gmv)} · ${bucket.bookings} đơn`}</title>
            </circle>
            <circle className="gmv" cx={x(index)} cy={y(bucket.gmv, maxGmv)} r="4">
              <title>{`${bucket.label}: GMV ${money(bucket.gmv)} · Doanh thu ${money(bucket.commission)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="system-dashboard-v4-chart-labels">
        {buckets.map((bucket, index) => (index % labelStep === 0 || index === buckets.length - 1) ? <span key={bucket.key}>{bucket.label}</span> : null)}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [state, setState] = useState({
    partners: [], pendingHotels: [], roomTypes: [], hotels: [], bookings: [], payments: [], refunds: [], withdrawals: [], complaints: [],
  });
  const [available, setAvailable] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState("30D");
  const [hotelId, setHotelId] = useState("ALL");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    const requests = [
      ["partners", getPendingPartnerRequests],
      ["pendingHotels", getPendingHotels],
      ["roomTypes", getPendingRoomTypes],
      ["hotels", getHotels],
      ["bookings", getSystemBookings],
      ["payments", () => getPaymentsByStatus("PAID")],
      ["refunds", () => getAdminRefundRequests("")],
      ["withdrawals", () => getWithdrawals("")],
      ["complaints", () => getAdminComplaints("")],
    ];
    const results = await Promise.allSettled(requests.map(([, request]) => request()));
    const next = {};
    const nextAvailable = {};
    results.forEach((result, index) => {
      const key = requests[index][0];
      nextAvailable[key] = result.status === "fulfilled";
      next[key] = result.status === "fulfilled" ? list(result.value) : [];
    });
    setState(next);
    setAvailable(nextAvailable);
    const failures = Object.values(nextAvailable).filter((value) => !value).length;
    if (failures === requests.length) setError("Chưa thể tải thông tin tổng quan lúc này.");
    else if (failures > 0) setError("Một số số liệu chưa cập nhật kịp. Những phần còn lại vẫn được hiển thị bình thường.");
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh([
    "PARTNER_REQUEST_UPDATED", "HOTEL_UPDATED", "ROOM_TYPE_UPDATED", "BOOKING_UPDATED",
    "PAYMENT_UPDATED", "REFUND_UPDATED", "WITHDRAWAL_UPDATED", "COMPLAINT_UPDATED",
  ], () => load({ quiet: true }));

  const openComplaints = useMemo(() => state.complaints.filter((item) => OPEN_COMPLAINT_STATUSES.has(normalizeEnum(item?.status))), [state.complaints]);
  const pendingWithdrawals = useMemo(() => state.withdrawals.filter((item) => PENDING_WITHDRAWAL_STATUSES.has(normalizeEnum(item?.status))), [state.withdrawals]);
  const actionableRefunds = useMemo(() => state.refunds.filter(refundNeedsAction), [state.refunds]);
  const successfulBookings = useMemo(() => state.bookings.filter((item) => SUCCESS_BOOKING_STATUSES.has(normalizeEnum(item?.status))), [state.bookings]);
  const financeCount = pendingWithdrawals.length + actionableRefunds.length;
  const periodStartAt = periodStart(range).getTime();
  const rangeLabel = RANGE_OPTIONS.find((item) => item.key === range)?.label ?? "kỳ đang chọn";
  const selectedPayments = useMemo(() => state.payments.filter((item) => {
    const date = new Date(paymentDate(item));
    return !Number.isNaN(date.getTime()) && date.getTime() >= periodStartAt && (hotelId === "ALL" || String(item?.hotelId) === String(hotelId));
  }), [hotelId, periodStartAt, state.payments]);
  const selectedBookings = useMemo(() => successfulBookings.filter((item) => {
    const date = new Date(item?.createdAt);
    return !Number.isNaN(date.getTime()) && date.getTime() >= periodStartAt && (hotelId === "ALL" || String(item?.hotelId) === String(hotelId));
  }), [hotelId, periodStartAt, successfulBookings]);
  const selectedRefunds = useMemo(() => state.refunds.filter((item) => {
    const date = new Date(item?.updatedAt ?? item?.requestedAt ?? item?.createdAt);
    return !Number.isNaN(date.getTime()) && date.getTime() >= periodStartAt && (hotelId === "ALL" || String(item?.hotelId) === String(hotelId));
  }), [hotelId, periodStartAt, state.refunds]);
  const platformRevenue = selectedPayments.reduce((sum, item) => sum + number(item?.commissionAmount), 0);
  const gmv = selectedPayments.reduce((sum, item) => sum + number(item?.amount), 0);
  const refundTotal = selectedRefunds.reduce((sum, item) => sum + completedRefundAmount(item), 0);
  const trend = useMemo(() => buildTrend(state.payments, state.bookings, range, hotelId), [hotelId, range, state.bookings, state.payments]);

  const kpis = [
    { label: "Đối tác chờ duyệt", value: available.partners ? state.partners.length : "—", icon: ClipboardCheck, tone: "info", to: "/admin/partner-requests" },
    { label: "Khách sạn chờ duyệt", value: available.pendingHotels ? state.pendingHotels.length : "—", icon: Building2, tone: "warning", to: "/admin/hotels" },
    { label: "Loại phòng chờ duyệt", value: available.roomTypes ? state.roomTypes.length : "—", icon: BedDouble, tone: "violet", to: "/admin/room-types" },
    { label: "Khiếu nại đang mở", value: available.complaints ? openComplaints.length : "—", icon: Flag, tone: "danger", to: "/admin/complaints" },
    { label: "Tài chính cần xử lý", value: available.withdrawals && available.refunds ? financeCount : "—", icon: WalletCards, tone: "warning", to: "/admin/wallet" },
  ];

  const management = [
    { label: "Quản lý tài khoản", to: "/admin/users", icon: Users },
    { label: "Yêu cầu đối tác", to: "/admin/partner-requests", icon: ClipboardCheck, badge: available.partners ? state.partners.length : null },
    { label: "Duyệt khách sạn", to: "/admin/hotels", icon: Building2, badge: available.pendingHotels ? state.pendingHotels.length : null },
    { label: "Duyệt loại phòng", to: "/admin/room-types", icon: BedDouble, badge: available.roomTypes ? state.roomTypes.length : null },
    { label: "Đơn đặt phòng", to: "/admin/bookings", icon: BookOpenCheck },
    { label: "Ví & đối soát", to: "/admin/wallet", icon: Landmark },
    { label: "Xử lý rút tiền", to: "/admin/wallet", icon: WalletCards, badge: available.withdrawals ? pendingWithdrawals.length : null },
    { label: "Xử lý khiếu nại", to: "/admin/complaints", icon: MessageSquareWarning, badge: available.complaints ? openComplaints.length : null },
    { label: "Quản lý đánh giá", to: "/admin/reviews", icon: Star },
    { label: "Ưu đãi / mã giảm giá", to: "/admin/marketing", icon: Gift },
    { label: "Chính sách EnziuRooms", to: "/admin/policies", icon: Settings2 },
  ];

  const hotelName = useMemo(() => new Map(state.hotels.map((hotel) => [String(hotel.id), hotel.name || `Khách sạn #${hotel.id}`])), [state.hotels]);
  const paymentRows = selectedPayments.map((item) => ({
    transactionCode: item.transactionCode ?? item.id, bookingId: item.bookingId, hotel: hotelName.get(String(item.hotelId)) ?? item.hotelName ?? item.hotelId,
    amount: number(item.amount), commission: number(item.commissionAmount), hotelNet: number(item.hotelNetAmount), paidAt: dateTime(paymentDate(item)),
  }));
  const performanceRows = state.hotels.map((hotel) => {
    const id = String(hotel.id);
    const payments = state.payments.filter((item) => String(item.hotelId) === id);
    const bookings = successfulBookings.filter((item) => String(item.hotelId) === id);
    const refunds = state.refunds.filter((item) => String(item.hotelId) === id);
    return { hotel: hotel.name ?? id, bookings: bookings.length, gmv: payments.reduce((sum, item) => sum + number(item.amount), 0), commission: payments.reduce((sum, item) => sum + number(item.commissionAmount), 0), refunds: refunds.reduce((sum, item) => sum + completedRefundAmount(item), 0) };
  });
  const bookingRows = state.bookings.map((item) => ({ code: item.bookingCode ?? item.id, hotel: hotelName.get(String(item.hotelId)) ?? item.hotelName ?? item.hotelId, room: item.roomTypeName ?? item.roomName ?? item.roomId ?? "—", status: normalizeEnum(item.status), paymentStatus: normalizeEnum(item.paymentStatus), total: number(item.totalPrice), paid: number(item.paidAmount), createdAt: dateTime(item.createdAt) }));
  const complaintRows = [
    ...state.complaints.map((item) => ({ code: item.complaintCode ?? item.code ?? item.id, booking: item.bookingCode ?? item.bookingId, hotel: item.hotelName ?? hotelName.get(String(item.hotelId)) ?? item.hotelId, type: item.issueType ?? item.category ?? "—", status: normalizeEnum(item.status), disputedAmount: number(item.disputedAmount), refundAmount: 0, updatedAt: dateTime(item.updatedAt ?? item.createdAt) })),
    ...state.refunds.map((item) => ({ code: item.refundCode ?? item.id, booking: item.bookingCode ?? item.bookingId, hotel: item.hotelName ?? hotelName.get(String(item.hotelId)) ?? item.hotelId, type: "REFUND", status: normalizeEnum(item.status), disputedAmount: 0, refundAmount: completedRefundAmount(item), updatedAt: dateTime(item.updatedAt ?? item.requestedAt) })),
  ];
  const withdrawalRows = state.withdrawals.map((item) => ({ code: item.withdrawalCode ?? item.id, hotel: item.hotelName ?? hotelName.get(String(item.hotelId)) ?? item.hotelId, amount: number(item.amount), bank: item.bankName ?? "—", account: item.accountName ?? item.accountHolderName ?? "—", status: normalizeEnum(item.status), requestedAt: dateTime(item.requestedAt ?? item.createdAt) }));

  const reports = [
    { key: "revenue", label: "Doanh thu hệ thống", rows: paymentRows, ready: available.payments, columns: [{ key: "transactionCode", label: "Mã giao dịch" }, { key: "bookingId", label: "Đơn đặt phòng" }, { key: "hotel", label: "Khách sạn" }, { key: "amount", label: "Giá trị giao dịch" }, { key: "commission", label: "Doanh thu hệ thống" }, { key: "hotelNet", label: "Phần khách sạn" }, { key: "paidAt", label: "Thanh toán lúc" }] },
    { key: "hotel-performance", label: "Hiệu suất khách sạn", rows: performanceRows, ready: available.hotels && available.payments && available.bookings && available.refunds, columns: [{ key: "hotel", label: "Khách sạn" }, { key: "bookings", label: "Đơn hoàn tất" }, { key: "gmv", label: "Giá trị giao dịch" }, { key: "commission", label: "Doanh thu hệ thống" }, { key: "refunds", label: "Đã hoàn" }] },
    { key: "bookings", label: "Danh sách đơn đặt phòng", rows: bookingRows, ready: available.bookings, columns: [{ key: "code", label: "Mã đặt phòng" }, { key: "hotel", label: "Khách sạn" }, { key: "room", label: "Phòng" }, { key: "status", label: "Trạng thái" }, { key: "paymentStatus", label: "Thanh toán" }, { key: "total", label: "Tổng tiền" }, { key: "paid", label: "Đã thanh toán" }, { key: "createdAt", label: "Tạo lúc" }] },
    { key: "complaints-refunds", label: "Khiếu nại / hoàn tiền", rows: complaintRows, ready: available.complaints && available.refunds, columns: [{ key: "code", label: "Mã hồ sơ" }, { key: "booking", label: "Đơn đặt phòng" }, { key: "hotel", label: "Khách sạn" }, { key: "type", label: "Loại" }, { key: "status", label: "Trạng thái" }, { key: "disputedAmount", label: "Tiền tranh chấp" }, { key: "refundAmount", label: "Đã hoàn" }, { key: "updatedAt", label: "Cập nhật" }] },
    { key: "withdrawals", label: "Yêu cầu rút tiền", rows: withdrawalRows, ready: available.withdrawals, columns: [{ key: "code", label: "Mã yêu cầu" }, { key: "hotel", label: "Khách sạn" }, { key: "amount", label: "Số tiền" }, { key: "bank", label: "Ngân hàng" }, { key: "account", label: "Chủ tài khoản" }, { key: "status", label: "Trạng thái" }, { key: "requestedAt", label: "Yêu cầu lúc" }] },
  ];

  if (loading) return <Loading message="Đang tải tổng quan EnziuRooms..." />;
  if (error && Object.values(available).every((value) => !value)) return <ErrorMessage message={error} onRetry={() => load()} />;

  return (
    <div className="system-dashboard-v4">
      <PageHeader
        className="system-dashboard-v4-heading"
        eyebrow="Hệ thống quản trị"
        title="Tổng quan EnziuRooms"
        description="Theo dõi hoạt động, tăng trưởng và các công việc cần xử lý trên EnziuRooms."
        actions={<button type="button" onClick={() => load({ quiet: true })} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />{refreshing ? "Đang làm mới" : "Làm mới"}</button>}
      />

      {error ? <div className="system-dashboard-v4-warning" role="status">{error}</div> : null}

      <section className="system-dashboard-v4-kpis" aria-label="Chỉ số vận hành">
        {kpis.map(({ icon: Icon, ...item }) => (
          <Link to={item.to} key={item.label} className="system-dashboard-v4-kpi-link">
            <StatCard label={item.label} value={item.value} icon={<Icon size={19} />} tone={item.tone} />
          </Link>
        ))}
      </section>

      <section className="system-dashboard-v4-business" aria-label="Thống kê kinh doanh trong kỳ">
        <article className="income"><span><BadgeDollarSign size={20} /></span><div><small>Doanh thu hệ thống</small><strong>{available.payments ? money(platformRevenue) : "—"}</strong><em>Hoa hồng đã ghi nhận · {rangeLabel}</em></div></article>
        <article className="gmv"><span><BarChart3 size={20} /></span><div><small>Tổng giá trị giao dịch (GMV)</small><strong>{available.payments ? money(gmv) : "—"}</strong><em>Thanh toán qua nền tảng · {rangeLabel}</em></div></article>
        <article className="booking"><span><BookOpenCheck size={20} /></span><div><small>Booking thành công</small><strong>{available.bookings ? selectedBookings.length.toLocaleString("vi-VN") : "—"}</strong><em>Trong {rangeLabel.toLowerCase()}</em></div></article>
        <article className="refund"><span><RotateCcw size={20} /></span><div><small>Hoàn tiền</small><strong>{available.refunds ? money(refundTotal) : "—"}</strong><em>Đã hoàn tất · {rangeLabel}</em></div></article>
      </section>

      <section className="system-dashboard-v4-workspace">
        <Panel
          className="system-dashboard-v4-panel system-dashboard-v4-growth"
          title="Biểu đồ tăng trưởng"
          description="Doanh thu EnziuRooms và GMV từ giao dịch đã thanh toán"
          icon={<BarChart3 size={20} />}
          actions={(
            <div className="system-dashboard-v4-chart-controls">
              <label><span className="sr-only">Lọc theo khách sạn</span><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="ALL">Tất cả khách sạn</option>{state.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name || `Khách sạn #${hotel.id}`}</option>)}</select></label>
              <label><span className="sr-only">Khoảng thời gian</span><select value={range} onChange={(event) => setRange(event.target.value)}>{RANGE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            </div>
          )}
        >
          <div className="system-dashboard-v4-legend"><span className="commission">Doanh thu hệ thống</span><span className="gmv">GMV</span></div>
          <GrowthChart buckets={trend} />
        </Panel>

        <Panel className="system-dashboard-v4-panel system-dashboard-v4-management" title="Quản lý" description="Đi tới chức năng quản trị" icon={<ShieldCheck size={20} />} padding="none">
          <nav aria-label="Lối tắt quản trị">
            {management.map(({ icon: Icon, ...item }) => (
              <Link to={item.to} key={item.label}>
                <span><Icon size={17} /></span><strong>{item.label}</strong>
                {item.badge !== null && item.badge !== undefined && item.badge > 0 ? <b>{item.badge}</b> : null}
                <ArrowRight size={15} />
              </Link>
            ))}
          </nav>
        </Panel>
      </section>

      <Panel className="system-dashboard-v4-panel system-dashboard-v4-reports" title="Xuất báo cáo" description="Tải báo cáo theo số liệu đang hiển thị" icon={<Download size={20} />}>
        <div className="system-dashboard-v4-report-grid">
          {reports.map((report) => {
            const disabled = !report.ready || report.rows.length === 0;
            const reason = !report.ready ? "Thông tin cho báo cáo này chưa sẵn sàng" : "Chưa có số liệu để xuất báo cáo";
            return (
              <article key={report.key}>
                <span><FileSpreadsheet size={18} /></span>
                <strong>{report.label}</strong>
                <div>
                  <button type="button" disabled={disabled} title={disabled ? reason : `Xuất ${report.label} dạng Excel`} onClick={() => exportExcel({ name: `enziurooms-${report.key}`, sheetName: report.label, columns: report.columns, rows: report.rows })}>Excel</button>
                  <button type="button" disabled={disabled} title={disabled ? reason : `Xuất ${report.label} dạng CSV`} onClick={() => exportCsv({ name: `enziurooms-${report.key}`, columns: report.columns, rows: report.rows })}>CSV</button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="system-dashboard-v4-report-note"><Bell size={14} /> Báo cáo chỉ khả dụng khi kỳ đã chọn có số liệu.</p>
      </Panel>
    </div>
  );
}
