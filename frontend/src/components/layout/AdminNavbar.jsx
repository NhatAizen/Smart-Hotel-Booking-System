import {
  ChevronDown,
  LogOut,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import NotificationBell from "../notifications/NotificationBell";
import "./AdminNavbarEnhancements.css";

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
  brandImageUrl,
  brandImageAlt,
  brandImageFit = "cover",
  accountAvatarUrl,
  items,
  desktopNavigation,
  profilePath,
  accountActions = [],
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const generatedId = useId();
  const headerRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const accountButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const baseId = `admin-navbar${generatedId}`;
  const mobileMenuId = `${baseId}-navigation`;
  const accountMenuId = `${baseId}-account-menu`;
  const accountButtonId = `${baseId}-account-button`;

  const avatarUrl = accountAvatarUrl ?? user?.avatarUrl ?? user?.avatar ?? null;
  const avatarText = user?.fullName?.trim()?.charAt(0)?.toUpperCase() ??
    (variant === "hotel" ? "H" : "A");

  const closeMenus = useCallback((options = {}) => {
    const shouldRestoreFocus = options?.restoreFocus === true;
    const focusTarget = restoreFocusRef.current;
    setMobileOpen(false);
    setAccountOpen(false);
    setOpenGroup(null);
    if (shouldRestoreFocus && focusTarget) {
      window.requestAnimationFrame(() => focusTarget.focus?.());
    }
  }, [setAccountOpen, setMobileOpen, setOpenGroup]);

  function handleLogout() {
    logout();
    closeMenus();
    navigate("/login", { replace: true });
  }

  function handleAccountAction(action, source) {
    if (action.disabled) return;
    const persistentTrigger = source === "mobile"
      ? mobileToggleRef.current
      : accountButtonRef.current;
    persistentTrigger?.focus();
    restoreFocusRef.current = persistentTrigger;
    closeMenus();
    action.onClick?.();
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

    function handleKeyDown(event) {
      if (event.key === "Escape" && (mobileOpen || accountOpen || openGroup)) {
        event.preventDefault();
        closeMenus({ restoreFocus: true });
        return;
      }

      if (event.key !== "Tab" || !mobileOpen || !headerRef.current) return;
      const focusable = [...headerRef.current.querySelectorAll(
        "a[href], button:not([disabled]):not(.admin-navbar-backdrop), [tabindex]:not([tabindex='-1'])",
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, closeMenus, mobileOpen, openGroup]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

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
          <span className={`admin-navbar-brand-icon ${brandImageUrl ? `has-image fit-${brandImageFit}` : ""}`}>
            {brandImageUrl ? (
              <img
                src={brandImageUrl}
                alt={brandImageAlt ?? roleLabel ?? "Ảnh khách sạn"}
              />
            ) : BrandIcon ? (
              <BrandIcon size={24} aria-hidden="true" />
            ) : (
              <span aria-hidden="true">E</span>
            )}
          </span>
          <span className="admin-navbar-brand-copy">
            <span className="admin-navbar-wordmark">
              <strong>Enziu</strong>Rooms
            </span>
            <small>{roleLabel}</small>
          </span>
        </Link>

        <nav
          ref={mobileMenuRef}
          id={mobileMenuId}
          className={`admin-navbar-menu ${mobileOpen ? "open" : ""}`}
          aria-label={roleDescription}
        >
          <div className="admin-navbar-desktop-menu">
            {desktopNavigation.map((entry, entryIndex) => {
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
              const groupButtonId = `${baseId}-group-button-${entryIndex}`;
              const groupMenuId = `${baseId}-group-menu-${entryIndex}`;

              return (
                <div className="admin-navbar-group" key={entry.label}>
                  <button
                    id={groupButtonId}
                    type="button"
                    className={`admin-navbar-group-button ${
                      isActive ? "active" : ""
                    }`}
                    onClick={(event) => {
                      restoreFocusRef.current = event.currentTarget;
                      setOpenGroup((current) =>
                        current === entry.label ? null : entry.label,
                      );
                      setAccountOpen(false);
                    }}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    aria-controls={groupMenuId}
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
                    <div
                      className="admin-navbar-dropdown"
                      id={groupMenuId}
                      role="menu"
                      aria-labelledby={groupButtonId}
                    >
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
            <div className="admin-navbar-mobile-account-actions">
              {accountActions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <button
                    type="button"
                    className={action.tone ?? ""}
                    disabled={action.disabled}
                    key={action.key ?? action.label}
                    onClick={() => handleAccountAction(action, "mobile")}
                  >
                    {ActionIcon ? <ActionIcon size={18} aria-hidden="true" /> : null}
                    {action.label}
                  </button>
                );
              })}
              <button type="button" className="logout" onClick={handleLogout}>
                <LogOut size={18} aria-hidden="true" />
                Đăng xuất
              </button>
            </div>
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
              ref={accountButtonRef}
              id={accountButtonId}
              type="button"
              className={`admin-navbar-account-button ${
                accountOpen ? "active" : ""
              }`}
              onClick={(event) => {
                restoreFocusRef.current = event.currentTarget;
                setAccountOpen((current) => !current);
                setMobileOpen(false);
                setOpenGroup(null);
              }}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-controls={accountMenuId}
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
              <div
                className="admin-navbar-account-dropdown"
                id={accountMenuId}
                role="menu"
                aria-labelledby={accountButtonId}
              >
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

                {accountActions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <button
                      type="button"
                      className={`admin-navbar-account-item ${action.tone ?? ""}`.trim()}
                      disabled={action.disabled}
                      key={action.key ?? action.label}
                      role="menuitem"
                      onClick={() => handleAccountAction(action, "desktop")}
                    >
                      {ActionIcon ? <ActionIcon size={18} aria-hidden="true" /> : null}
                      <span>
                        <strong>{action.label}</strong>
                        {action.description ? <small>{action.description}</small> : null}
                      </span>
                    </button>
                  );
                })}

                {profilePath || accountActions.length > 0 ? (
                  <div className="admin-navbar-dropdown-divider" />
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
            ref={mobileToggleRef}
            type="button"
            className="admin-navbar-mobile-toggle"
            onClick={(event) => {
              const willOpen = !mobileOpen;
              restoreFocusRef.current = event.currentTarget;
              setMobileOpen(willOpen);
              setAccountOpen(false);
              setOpenGroup(null);
              if (willOpen) {
                window.requestAnimationFrame(() => {
                  mobileMenuRef.current
                    ?.querySelector(".admin-navbar-mobile-list a[href]")
                    ?.focus();
                });
              }
            }}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            aria-label={mobileOpen ? "Đóng menu" : `Mở menu ${roleDescription}`}
          >
            {mobileOpen
              ? <X size={22} aria-hidden="true" />
              : <Menu size={22} aria-hidden="true" />}
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
