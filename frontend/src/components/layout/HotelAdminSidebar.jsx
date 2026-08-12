import {
  BedDouble,
  Bell,
  DoorOpen,
  Building2,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ScanLine,
  Tags,
  WalletCards,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

const items = [
  {
    to: "/hotel-admin",
    label: "Tổng quan",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/hotel-admin/hotels",
    label: "Khách sạn của tôi",
    icon: Building2,
  },
  {
    to: "/hotel-admin/hotels/create",
    label: "Đăng ký khách sạn",
    icon: PlusCircle,
  },
  {
    to: "/hotel-admin/room-types",
    label: "Loại phòng",
    icon: Tags,
  },
  {
    to: "/hotel-admin/rooms",
    label: "Quản lý phòng",
    icon: BedDouble,
  },
  {
    to: "/hotel-admin/check-in",
    label: "Nhận phòng QR",
    icon: ScanLine,
  },
  {
    to: "/hotel-admin/current-stays",
    label: "Khách đang lưu trú",
    icon: DoorOpen,
  },
  {
    to: "/hotel-admin/profile",
    label: "Hồ sơ cá nhân",
    icon: UserRound,
  },
  {
    to: "/hotel-admin/wallet",
    label: "Ví & rút tiền",
    icon: WalletCards,
  },
  {
    to: "/hotel-admin/notifications",
    label: "Thông báo",
    icon: Bell,
  },
];

export default function HotelAdminSidebar() {
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
        aria-label="Mở menu quản lý khách sạn"
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

      <aside
        className={`admin-sidebar hotel-admin-sidebar ${
          open ? "open" : ""
        }`}
      >
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon hotel-admin-brand-icon">
            <Hotel size={25} />
          </div>

          <div>
            <strong>EnziuRooms</strong>
            <span>Hotel Admin</span>
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
          <p className="admin-nav-title">QUẢN LÝ ĐỐI TÁC</p>

          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `admin-nav-link ${
                  isActive ? "active" : ""
                }`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-user">
          <div className="admin-user-avatar hotel-admin-user-avatar">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.fullName ?? "Ảnh đại diện"}
              />
            ) : (
              user?.fullName?.charAt(0)?.toUpperCase() ?? "H"
            )}
          </div>

          <div className="admin-user-copy">
            <strong>{user?.fullName ?? "Hotel Admin"}</strong>
            <span>{user?.email ?? "Đối tác khách sạn"}</span>
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
