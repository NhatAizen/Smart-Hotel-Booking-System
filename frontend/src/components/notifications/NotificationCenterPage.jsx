import {
  Bell,
  Building2,
  CalendarCheck2,
  Check,
  CheckCheck,
  CircleDollarSign,
  Hotel,
  Search,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import { resolveNotificationTarget } from "../../utils/notificationNavigation";
import ErrorMessage from "../common/ErrorMessage";
import Loading from "../common/Loading";
import { EmptyState, Pagination } from "../ui";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notificationService";

const FILTERS = [
  ["ALL", "Tất cả"],
  ["UNREAD", "Chưa đọc"],
  ["BOOKING", "Đặt phòng"],
  ["PAYMENT", "Thanh toán"],
  ["HOTEL", "Khách sạn"],
  ["HOUSEKEEPING", "Vận hành"],
  ["REVIEW", "Đánh giá"],
  ["PARTNER", "Đối tác"],
  ["FINANCE", "Tài chính"],
  ["SYSTEM", "Hệ thống"],
];

const CATEGORY_META = {
  BOOKING: [CalendarCheck2, "Đặt phòng"],
  PAYMENT: [CircleDollarSign, "Thanh toán"],
  HOTEL: [Hotel, "Khách sạn"],
  HOUSEKEEPING: [Sparkles, "Vận hành"],
  PARTNER: [Building2, "Đối tác"],
  FINANCE: [WalletCards, "Tài chính"],
  SYSTEM: [Bell, "Hệ thống"],
  REVIEW: [Sparkles, "Đánh giá"],
};

const PAGE_SIZE = 10;

function dateTime(value) {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function NotificationCenterPage({
  eyebrow = "THÔNG BÁO",
  title = "Trung tâm thông báo",
  description = "Theo dõi các cập nhật quan trọng trên EnziuRooms.",
  admin = false,
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (!userId) {
      setLoading(false);
      setError("Không xác định được tài khoản để tải thông báo.");
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await getMyNotifications(userId, userRole);
      setItems(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải thông báo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, userRole]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  useRealtimeRefresh(
    "NOTIFICATION_CREATED",
    () => load(true),
    { debounceMs: 60 },
  );

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const category = String(item.category ?? "UNKNOWN").toUpperCase();
      const filterMatch = filter === "ALL"
        || (filter === "UNREAD" && !item.read)
        || category === filter;
      const keywordMatch = !keyword
        || `${item.title ?? ""} ${item.content ?? ""}`.toLowerCase().includes(keyword);
      return filterMatch && keywordMatch;
    });
  }, [filter, items, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  async function markRead(item, navigateAfter = false) {
    if (!item.read) {
      try {
        await markNotificationRead(item.id, userId);
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
      } catch (requestError) {
        setError(requestError.response?.data?.message ?? "Không thể đánh dấu đã đọc.");
        return;
      }
    }
    if (navigateAfter) {
      const target = resolveNotificationTarget(item, userRole);
      if (target) navigate(target);
    }
  }

  async function markAll() {
    if (!userId || unread === 0) return;
    setBusy(true);
    setError("");
    try {
      await markAllNotificationsRead(userId, userRole);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể đánh dấu tất cả đã đọc.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading message="Đang tải trung tâm thông báo..." />;

  return (
    <div className={admin ? "notification-center admin-notification-center" : "notification-center customer-notification-center"}>
      <section className="notification-center-heading">
        <div>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="notification-center-summary">
          <div><strong>{items.length}</strong><span>Tổng thông báo</span></div>
          <div><strong>{unread}</strong><span>Chưa đọc</span></div>
          <button type="button" onClick={markAll} disabled={busy || unread === 0}>
            <CheckCheck size={17} /> Đánh dấu tất cả đã đọc
          </button>
        </div>
      </section>

      <ErrorMessage message={error} onRetry={() => void load()} />

      <section className="notification-center-toolbar">
        <div className="notification-filter-tabs" role="tablist" aria-label="Lọc thông báo">
          {FILTERS.map(([value, label]) => {
            if (["PARTNER", "FINANCE"].includes(value) && userRole === "CUSTOMER") return null;
            return (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                role="tab"
                aria-selected={filter === value}
                aria-controls="notification-results"
              >
                {label}
              </button>
            );
          })}
        </div>
        <label className="notification-search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm trong thông báo..."
            aria-label="Tìm trong thông báo"
          />
        </label>
      </section>

      <section
        className="notification-center-list"
        id="notification-results"
        role="tabpanel"
        aria-label={`${filtered.length} thông báo phù hợp`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            className="notification-center-empty"
            icon={<Bell size={30} />}
            title={error && items.length === 0
              ? "Chưa thể hiển thị thông báo"
              : "Không có thông báo phù hợp"}
            description={error && items.length === 0
              ? "Dữ liệu thông báo chưa tải được. Hãy thử lại khi kết nối ổn định."
              : "Các cập nhật mới sẽ tự động xuất hiện tại đây."}
          />
        ) : visibleItems.map((item) => {
          const category = String(item.category ?? "UNKNOWN").toUpperCase();
          const [Icon, label] = CATEGORY_META[category] ?? [Bell, "Khác"];
          return (
            <article className={`notification-center-item ${item.read ? "read" : "unread"}`} key={item.id}>
              <span className={`notification-center-icon ${category.toLowerCase()}`}><Icon size={20} /></span>
              <div className="notification-center-copy">
                <div className="notification-center-title-row">
                  <div>
                    <span className="notification-category">{label}</span>
                    {!item.read ? <span className="notification-new-tag">Mới</span> : null}
                  </div>
                  <time dateTime={item.createdAt || undefined}>{dateTime(item.createdAt)}</time>
                </div>
                <h3>{item.title || "Thông báo"}</h3>
                <p>{item.content || "Không có nội dung chi tiết."}</p>
                <div className="notification-center-actions">
                  {resolveNotificationTarget(item, userRole) ? (
                    <button type="button" className="primary" onClick={() => void markRead(item, true)}>
                      Xem chi tiết
                    </button>
                  ) : null}
                  {!item.read ? (
                    <button type="button" onClick={() => void markRead(item)}>
                      <Check size={15} /> Đã đọc
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        ariaLabel="Phân trang thông báo"
      />
    </div>
  );
}
