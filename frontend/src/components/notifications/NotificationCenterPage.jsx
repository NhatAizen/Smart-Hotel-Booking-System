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

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
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
      const category = String(item.category ?? "SYSTEM").toUpperCase();
      const filterMatch = filter === "ALL"
        || (filter === "UNREAD" && !item.read)
        || category === filter;
      const keywordMatch = !keyword
        || `${item.title ?? ""} ${item.content ?? ""}`.toLowerCase().includes(keyword);
      return filterMatch && keywordMatch;
    });
  }, [filter, items, search]);

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
    <main className={admin ? "notification-center admin-notification-center" : "notification-center customer-notification-center"}>
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
        <div className="notification-filter-tabs">
          {FILTERS.map(([value, label]) => {
            if (["PARTNER", "FINANCE"].includes(value) && userRole === "CUSTOMER") return null;
            return (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label className="notification-search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trong thông báo..." />
        </label>
      </section>

      <section className="notification-center-list">
        {filtered.length === 0 ? (
          <div className="notification-center-empty">
            <Bell size={42} />
            <h2>Không có thông báo phù hợp</h2>
            <p>Các cập nhật mới sẽ tự động xuất hiện tại đây.</p>
          </div>
        ) : filtered.map((item) => {
          const category = String(item.category ?? "SYSTEM").toUpperCase();
          const [Icon, label] = CATEGORY_META[category] ?? CATEGORY_META.SYSTEM;
          return (
            <article className={`notification-center-item ${item.read ? "read" : "unread"}`} key={item.id}>
              <span className={`notification-center-icon ${category.toLowerCase()}`}><Icon size={20} /></span>
              <div className="notification-center-copy">
                <div className="notification-center-title-row">
                  <div>
                    <span className="notification-category">{label}</span>
                    {!item.read ? <span className="notification-new-tag">Mới</span> : null}
                  </div>
                  <time>{dateTime(item.createdAt)}</time>
                </div>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
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
    </main>
  );
}
