import {
  Bell,
  Building2,
  CalendarCheck2,
  CheckCheck,
  CircleDollarSign,
  Hotel,
  Sparkles,
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
};

const ROLE_PAGE = {
  CUSTOMER: "/customer/notifications",
  HOTEL_ADMIN: "/hotel-admin/notifications",
  SYSTEM_ADMIN: "/admin/notifications",
};

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

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMyNotifications(userId, userRole);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // Bell must never break the surrounding layout.
    }
  }, [userId, userRole]);

  useEffect(() => {
    void load();
    // Fallback nhẹ nếu WebSocket bị chặn bởi proxy/mạng di động.
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
  const preview = items.slice(0, 5);
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
          className="notification-popover"
          id="notification-popover"
          role="dialog"
          aria-label="Thông báo gần đây"
        >
          <header>
            <div>
              <strong>Thông báo</strong>
              <span>{unread ? `${unread} chưa đọc` : "Bạn đã xem hết"}</span>
            </div>
            {unread > 0 ? (
              <button type="button" onClick={markAll} disabled={loading}>
                <CheckCheck size={16} /> Đọc tất cả
              </button>
            ) : null}
          </header>

          <div className="notification-popover-list">
            {preview.length === 0 ? (
              <div className="notification-popover-empty">
                <Bell size={28} />
                <span>Chưa có thông báo mới</span>
              </div>
            ) : preview.map((item) => {
              const Icon = CATEGORY_ICON[item.category] ?? Bell;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`notification-preview-item ${item.read ? "read" : "unread"}`}
                  onClick={() => void openItem(item)}
                >
                  <span className={`notification-preview-icon ${String(item.category ?? "system").toLowerCase()}`}>
                    <Icon size={18} />
                  </span>
                  <span className="notification-preview-copy">
                    <strong>{item.title}</strong>
                    <small>{item.content}</small>
                    <em>{relativeTime(item.createdAt)}</em>
                  </span>
                  {!item.read ? <i /> : null}
                </button>
              );
            })}
          </div>

          <Link className="notification-popover-footer" to={page} onClick={() => setOpen(false)}>
            Xem tất cả thông báo
          </Link>
        </section>
      ) : null}
    </div>
  );
}
