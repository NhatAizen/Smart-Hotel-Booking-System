import {
  ChevronDown,
  LogOut,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import NotificationBell from "../notifications/NotificationBell";

function itemMatchesPath(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavbarLink({ item, className = "", onSelect, role }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      role={role}
      onClick={onSelect}
      className={({ isActive }) =>
        `admin-navbar-link ${className} ${isActive ? "active" : ""}`.trim()
      }
    >
      <Icon size={17} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function AdminNavbar({
  variant,
  roleLabel,
  roleDescription,
  homePath,
  brandIcon: BrandIcon,
  items,
  desktopNavigation,
  profilePath,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const headerRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  const avatarUrl = user?.avatarUrl ?? user?.avatar ?? null;
  const avatarText = user?.fullName?.trim()?.charAt(0)?.toUpperCase() ??
    (variant === "hotel" ? "H" : "A");

  const closeMenus = useCallback(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setOpenGroup(null);
  }, []);

  function handleLogout() {
    logout();
    closeMenus();
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    closeMenus();
  }, [closeMenus, location.pathname, location.search]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        closeMenus();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") closeMenus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeMenus]);

  return (
    <header
      ref={headerRef}
      className={`admin-navbar-header admin-navbar-${variant}`}
    >
      <div className="admin-navbar-inner">
        <Link
          to={homePath}
          className="admin-navbar-brand"
          onClick={closeMenus}
          aria-label={`EnziuRooms ${roleLabel} - Tổng quan`}
        >
          <span className="admin-navbar-brand-icon">
            <BrandIcon size={24} aria-hidden="true" />
          </span>
          <span className="admin-navbar-brand-copy">
            <span className="admin-navbar-wordmark">
              <strong>Enziu</strong>Rooms
            </span>
            <small>{roleLabel}</small>
          </span>
        </Link>

        <nav
          className={`admin-navbar-menu ${mobileOpen ? "open" : ""}`}
          aria-label={roleDescription}
        >
          <div className="admin-navbar-desktop-menu">
            {desktopNavigation.map((entry) => {
              if (entry.type === "link") {
                return (
                  <NavbarLink
                    key={entry.item.to}
                    item={entry.item}
                    onSelect={closeMenus}
                  />
                );
              }

              const GroupIcon = entry.icon;
              const isActive = entry.items.some((item) =>
                itemMatchesPath(item, location.pathname),
              );
              const isOpen = openGroup === entry.label;

              return (
                <div className="admin-navbar-group" key={entry.label}>
                  <button
                    type="button"
                    className={`admin-navbar-group-button ${
                      isActive ? "active" : ""
                    }`}
                    onClick={() => {
                      setOpenGroup((current) =>
                        current === entry.label ? null : entry.label,
                      );
                      setAccountOpen(false);
                    }}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                  >
                    <GroupIcon size={17} aria-hidden="true" />
                    <span>{entry.label}</span>
                    <ChevronDown
                      size={15}
                      className={isOpen ? "open" : ""}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen ? (
                    <div className="admin-navbar-dropdown" role="menu">
                      {entry.items.map((item) => (
                        <NavbarLink
                          key={item.to}
                          item={item}
                          className="admin-navbar-dropdown-link"
                          onSelect={closeMenus}
                          role="menuitem"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="admin-navbar-mobile-list">
            {items.map((item) => (
              <NavbarLink
                key={item.to}
                item={item}
                onSelect={closeMenus}
              />
            ))}
          </div>

          <div className="admin-navbar-mobile-account">
            <div className="admin-navbar-user-summary">
              <span className="admin-navbar-avatar">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user?.fullName ?? "Ảnh đại diện"}
                  />
                ) : (
                  avatarText
                )}
              </span>
              <span>
                <strong>{user?.fullName ?? roleLabel}</strong>
                <small>{user?.email ?? roleDescription}</small>
              </span>
            </div>
            <button type="button" onClick={handleLogout}>
              <LogOut size={18} aria-hidden="true" />
              Đăng xuất
            </button>
          </div>
        </nav>

        <div className="admin-navbar-actions">
          <div
            onMouseDown={() => {
              setMobileOpen(false);
              setAccountOpen(false);
              setOpenGroup(null);
            }}
          >
            <NotificationBell admin />
          </div>

          <div className="admin-navbar-account">
            <button
              type="button"
              className={`admin-navbar-account-button ${
                accountOpen ? "active" : ""
              }`}
              onClick={() => {
                setAccountOpen((current) => !current);
                setMobileOpen(false);
                setOpenGroup(null);
              }}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <span className="admin-navbar-avatar">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user?.fullName ?? "Ảnh đại diện"}
                  />
                ) : (
                  avatarText
                )}
              </span>
              <span className="admin-navbar-account-copy">
                <strong>{user?.fullName ?? roleLabel}</strong>
                <small>{roleDescription}</small>
              </span>
              <ChevronDown
                size={16}
                className={accountOpen ? "open" : ""}
                aria-hidden="true"
              />
            </button>

            {accountOpen ? (
              <div className="admin-navbar-account-dropdown" role="menu">
                <div className="admin-navbar-account-header">
                  <span className="admin-navbar-avatar large">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={user?.fullName ?? "Ảnh đại diện"}
                      />
                    ) : (
                      avatarText
                    )}
                  </span>
                  <span>
                    <strong>{user?.fullName ?? roleLabel}</strong>
                    <small>{user?.email ?? roleDescription}</small>
                  </span>
                </div>

                <div className="admin-navbar-dropdown-divider" />

                {profilePath ? (
                  <Link
                    to={profilePath}
                    className="admin-navbar-account-item"
                    role="menuitem"
                    onClick={closeMenus}
                  >
                    <UserRound size={18} aria-hidden="true" />
                    <span>
                      <strong>Hồ sơ cá nhân</strong>
                      <small>Thông tin tài khoản</small>
                    </span>
                  </Link>
                ) : null}

                <button
                  type="button"
                  className="admin-navbar-account-item logout"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <LogOut size={18} aria-hidden="true" />
                  <span>
                    <strong>Đăng xuất</strong>
                    <small>Thoát khỏi tài khoản quản trị</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="admin-navbar-mobile-toggle"
            onClick={() => {
              setMobileOpen((current) => !current);
              setAccountOpen(false);
              setOpenGroup(null);
            }}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Đóng menu" : `Mở menu ${roleDescription}`}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          className="admin-navbar-backdrop"
          onClick={closeMenus}
          aria-label="Đóng menu"
        />
      ) : null}
    </header>
  );
}
