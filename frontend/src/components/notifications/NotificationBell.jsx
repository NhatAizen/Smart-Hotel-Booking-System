import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarCheck2,
  CheckCheck,
  CircleDollarSign,
  Gift,
  Hotel,
  LayoutGrid,
  Sparkles,
  Star,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import { resolveNotificationTarget } from "../../utils/notificationNavigation";
import { normalizeEnum } from "../../utils/presentation";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notificationService";

const CATEGORY_ICON = {
  BOOKING: CalendarCheck2,
  PAYMENT: CircleDollarSign,
  HOTEL: Hotel,
  HOUSEKEEPING: Sparkles,
  PARTNER: Building2,
  FINANCE: WalletCards,
  REVIEW: Star,
  PROMOTION: Gift,
  CAMPAIGN: Gift,
  MEMBERSHIP: Gift,
  LOYALTY: Gift,
};

const ROLE_PAGE = {
  CUSTOMER: "/customer/notifications",
  HOTEL_ADMIN: "/hotel-admin/notifications",
  SYSTEM_ADMIN: "/admin/notifications",
};

const FILTERS = [
  { key: "ALL", label: "Tất cả", icon: LayoutGrid },
  { key: "UNREAD", label: "Chưa đọc", dot: true },
  { key: "BOOKING", label: "Booking", icon: CalendarCheck2 },
  { key: "PROMOTION", label: "Khuyến mãi", icon: Gift },
];

function relativeTime(value) {
  if (!value) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Vừa xong";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function itemSearchText(item) {
  return [item?.category, item?.type, item?.title, item?.content]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function isPromotionNotification(item) {
  const text = itemSearchText(item);
  return [
    "PROMOTION",
    "CAMPAIGN",
    "MEMBERSHIP",
    "LOYALTY",
    "KHUYẾN MÃI",
    "KHUYEN MAI",
    "ƯU ĐÃI",
    "UU DAI",
    "VOUCHER",
    "THÀNH VIÊN",
    "THANH VIEN",
  ].some((token) => text.includes(token));
}

function isBookingNotification(item) {
  const text = itemSearchText(item);
  return [
    "BOOKING",
    "CHECK-IN",
    "CHECKIN",
    "CHECK_OUT",
    "CHECK-OUT",
    "CHECKOUT",
    "NHẬN PHÒNG",
    "NHAN PHONG",
    "TRẢ PHÒNG",
    "TRA PHONG",
    "ĐẶT PHÒNG",
    "DAT PHONG",
  ].some((token) => text.includes(token));
}

function visualForNotification(item) {
  const text = itemSearchText(item);

  if (
    text.includes("CHƯA CHECK-IN") ||
    text.includes("CHUA CHECK-IN") ||
    text.includes("NO_SHOW") ||
    text.includes("NO-SHOW") ||
    text.includes("QUÁ GIỜ") ||
    text.includes("QUA GIO") ||
    text.includes("FAILED") ||
    text.includes("THẤT BẠI") ||
    text.includes("THAT BAI")
  ) {
    return { Icon: AlertTriangle, tone: "warning" };
  }

  if (isPromotionNotification(item)) {
    return { Icon: Gift, tone: "promotion" };
  }

  const normalizedCategory = String(item?.category ?? "").toUpperCase();
  const Icon = CATEGORY_ICON[normalizedCategory] ?? (isBookingNotification(item) ? CalendarCheck2 : Bell);
  const tone = normalizedCategory
    ? normalizedCategory.toLowerCase()
    : isBookingNotification(item)
      ? "booking"
      : "system";

  return { Icon, tone };
}

function matchesFilter(item, filter) {
  if (filter === "UNREAD") return !item.read;
  if (filter === "BOOKING") return isBookingNotification(item) && !isPromotionNotification(item);
  if (filter === "PROMOTION") return isPromotionNotification(item);
  return true;
}

export default function NotificationBell({ admin = false }) {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMyNotifications(userId, userRole);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // Notification bell must never break the surrounding navbar.
    }
  }, [userId, userRole]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  useRealtimeRefresh("NOTIFICATION_CREATED", load, { debounceMs: 50 });

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function close(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const filteredItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)).slice(0, 8),
    [items, filter],
  );
  const normalizedRole = normalizeEnum(userRole);
  const page = ROLE_PAGE[normalizedRole] ?? "/";

  async function openItem(item) {
    if (!item.read) {
      try {
        await markNotificationRead(item.id, userId);
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
      } catch {
        // Navigation is still more useful than blocking on read status.
      }
    }

    setOpen(false);
    const target = resolveNotificationTarget(item, normalizedRole);
    if (target) navigate(target);
  }

  async function markAll() {
    if (!userId || unread === 0) return;
    setLoading(true);
    try {
      await markAllNotificationsRead(userId, userRole);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`notification-bell-root ${admin ? "admin" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={admin ? "admin-notification-button notification-bell-button" : "nav-icon-button notification-bell-button"}
        title="Thông báo"
        aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`}
        aria-expanded={open}
        aria-controls="notification-popover"
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={20} />
        {unread > 0 ? <span className="notification-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <section
          className="notification-popover notification-popover-premium"
          id="notification-popover"
          role="dialog"
          aria-label="Thông báo gần đây"
        >
          <header className="notification-popover-header">
            <div className="notification-popover-heading">
              <span className="notification-popover-heading-icon" aria-hidden="true">
                <Bell size={29} strokeWidth={2} />
              </span>
              <div>
                <strong>Thông báo</strong>
                <span>{unread ? `${unread} chưa đọc` : "Bạn đã xem hết"}</span>
              </div>
            </div>

            <button
              className="notification-mark-all"
              type="button"
              onClick={markAll}
              disabled={loading || unread === 0}
            >
              <CheckCheck size={19} />
              <span>Đánh dấu đã đọc tất cả</span>
            </button>
          </header>

          <div className="notification-popover-filters" role="tablist" aria-label="Lọc thông báo">
            {FILTERS.map((entry) => {
              const FilterIcon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === entry.key}
                  className={filter === entry.key ? "active" : ""}
                  onClick={() => setFilter(entry.key)}
                >
                  {FilterIcon ? <FilterIcon size={17} /> : null}
                  {entry.dot ? <span className="notification-filter-dot" /> : null}
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>

          <div className="notification-popover-list notification-popover-card-list">
            {filteredItems.length === 0 ? (
              <div className="notification-popover-empty">
                <Bell size={30} />
                <strong>Không có thông báo phù hợp</strong>
                <span>Hãy thử chọn bộ lọc khác.</span>
              </div>
            ) : filteredItems.map((item) => {
              const { Icon, tone } = visualForNotification(item);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`notification-preview-item ${item.read ? "read" : "unread"}`}
                  onClick={() => void openItem(item)}
                >
                  <span className={`notification-preview-icon ${tone}`}>
                    <Icon size={24} strokeWidth={2} />
                  </span>

                  <span className="notification-preview-copy">
                    <strong>{item.title}</strong>
                    <small>{item.content}</small>
                    <em>{relativeTime(item.createdAt)}</em>
                  </span>

                  {!item.read ? (
                    <i aria-label="Chưa đọc" />
                  ) : isPromotionNotification(item) ? (
                    <CheckCheck className="notification-read-check" size={19} />
                  ) : null}
                </button>
              );
            })}
          </div>

          <Link className="notification-popover-footer" to={page} onClick={() => setOpen(false)}>
            <CalendarCheck2 size={18} />
            <span>Xem tất cả thông báo</span>
            <span aria-hidden="true">›</span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
