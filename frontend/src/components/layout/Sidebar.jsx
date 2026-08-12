import {
  Bell,
  Building2,
  BedDouble,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

const adminItems = [
  {
    to: "/admin",
    label: "Tổng quan",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/admin/users",
    label: "Quản lý tài khoản",
    icon: Users,
  },
  {
    to: "/admin/partner-requests",
    label: "Yêu cầu đối tác",
    icon: ClipboardCheck,
  },
  {
    to: "/admin/hotels",
    label: "Duyệt khách sạn",
    icon: Building2,
  },
  {
    to: "/admin/room-types",
    label: "Duyệt loại phòng",
    icon: BedDouble,
  },
  {
    to: "/admin/wallet",
    label: "Ví & đối soát",
    icon: WalletCards,
  },
  {
    to: "/admin/notifications",
    label: "Thông báo",
    icon: Bell,
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <button
        className="admin-mobile-toggle"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu quản trị"
      >
        <Menu size={22} />
      </button>

      {open ? (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Đóng menu"
        />
      ) : null}

      <aside className={`admin-sidebar ${open ? "open" : ""}`}>
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon">
            <ShieldCheck size={25} />
          </div>
          <div>
            <strong>EnziuRooms</strong>
            <span>System Admin</span>
          </div>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          <p className="admin-nav-title">QUẢN TRỊ HỆ THỐNG</p>
          {adminItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `admin-nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-user">
          <div className="admin-user-avatar">
            {user?.fullName?.charAt(0)?.toUpperCase() ?? "A"}
          </div>
          <div className="admin-user-copy">
            <strong>{user?.fullName ?? "System Admin"}</strong>
            <span>{user?.email ?? "Quản trị viên"}</span>
          </div>
          <button
            type="button"
            className="admin-logout-icon"
            onClick={handleLogout}
            title="Đăng xuất"
          >
            <LogOut size={19} />
          </button>
        </div>
      </aside>
    </>
  );
}
