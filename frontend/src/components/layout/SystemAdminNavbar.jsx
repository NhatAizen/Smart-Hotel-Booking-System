import {
  BedDouble,
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  ScrollText,
  Star,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import enziuLogo from "../../assets/enziu-logo.png";
import { getPlatformWallet } from "../../services/paymentService";
import NotificationBell from "../notifications/NotificationBell";
import { AvatarImage } from "../ui";

const SYSTEM_ADMIN_OVERVIEW_PATH = "/admin";
const SYSTEM_ADMIN_HOTEL_EXPLORER_PATH = "/admin/explore-hotels";

const navigationGroups = [
  {
    key: "operations",
    label: "Vận hành",
    items: [
      { to: "/admin/users", label: "Tài khoản", description: "Khách hàng và đối tác", icon: Users },
      { to: "/admin/partner-requests", label: "Yêu cầu đối tác", description: "Hồ sơ đăng ký và xác minh danh tính", icon: ClipboardCheck },
      { to: "/admin/hotels", label: "Duyệt khách sạn", description: "Hồ sơ cơ sở lưu trú", icon: Building2 },
      { to: "/admin/room-types", label: "Duyệt loại phòng", description: "Thông tin và giá phòng", icon: BedDouble },
      { to: "/admin/bookings", label: "Đơn đặt phòng", description: "Theo dõi các đơn trên EnziuRooms", icon: ClipboardList },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      { to: "/admin/wallet", label: "Ví & đối soát", description: "Chi trả, hoàn tiền và giao dịch", icon: WalletCards },
    ],
  },
  {
    key: "moderation",
    label: "Kiểm duyệt",
    items: [
      { to: "/admin/complaints", label: "Trung tâm khiếu nại", description: "Điều phối và kết luận vụ việc", icon: LifeBuoy },
      { to: "/admin/reviews", label: "Đánh giá", description: "Kiểm duyệt nội dung công khai", icon: Star },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    items: [
      { to: "/admin/marketing", label: "Ưu đãi & thành viên", description: "Chương trình toàn nền tảng", icon: Gift },
      { to: "/admin/policies", label: "Chính sách EnziuRooms", description: "Điều kiện vận hành và pháp lý", icon: ScrollText },
      { to: "/admin/notifications", label: "Thông báo", description: "Cập nhật cần theo dõi", icon: Bell },
    ],
  },
];

function itemMatchesPath(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function groupMatchesPath(group, pathname) {
  return group.items.some((item) => itemMatchesPath(item, pathname));
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${Math.round(amount).toLocaleString("vi-VN")} ₫`;
}

export default function SystemAdminNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const headerRef = useRef(null);
  const accountButtonRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const desktopDropdownRef = useRef(null);
  const groupButtonRefs = useRef(new Map());
  const [openGroup, setOpenGroup] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);

  const avatarText = user?.fullName?.trim()?.charAt(0)?.toUpperCase() || "A";
  const activeDropdownGroup = navigationGroups.find((group) => group.key === openGroup);

  const updateDropdownPosition = useCallback(() => {
    if (!openGroup) return;
    if (window.innerWidth <= 1050) {
      setOpenGroup("");
      return;
    }
    const trigger = groupButtonRefs.current.get(openGroup);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 10;
    const width = Math.min(360, window.innerWidth - (viewportPadding * 2));
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );
    const top = rect.bottom + gap;
    setDropdownPosition({
      top,
      left,
      width,
      maxHeight: Math.max(160, window.innerHeight - top - viewportPadding),
    });
  }, [openGroup]);

  useEffect(() => {
    let active = true;
    getPlatformWallet()
      .then((wallet) => {
        if (active) setWalletBalance(wallet?.availableBalance);
      })
      .catch(() => {
        if (active) setWalletBalance(null);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setOpenGroup("");
    setMobileMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!openGroup) {
      setDropdownPosition(null);
      return undefined;
    }
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [openGroup, updateDropdownPosition]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => mobilePanelRef.current?.querySelector("a[href]")?.focus());
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    function handlePointerDown(event) {
      const clickedHeader = headerRef.current?.contains(event.target);
      const clickedDropdown = desktopDropdownRef.current?.contains(event.target);
      if (!clickedHeader && !clickedDropdown) {
        setOpenGroup("");
        setAccountOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          mobileButtonRef.current?.focus();
        } else if (accountOpen) {
          setAccountOpen(false);
          accountButtonRef.current?.focus();
        } else {
          setOpenGroup("");
        }
        return;
      }
      if (event.key === "Tab" && mobileMenuOpen && mobilePanelRef.current) {
        const focusable = [...mobilePanelRef.current.querySelectorAll("a[href], button:not([disabled])")]
          .filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, mobileMenuOpen]);

  function handleLogout() {
    setAccountOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header ref={headerRef} className="system-admin-header">
      <div className="system-admin-header__inner">
        <Link className="system-admin-header__brand" to={SYSTEM_ADMIN_OVERVIEW_PATH} aria-label="EnziuRooms - Tổng quan quản trị">
          <span className="system-admin-header__logo"><img src={enziuLogo} alt="" /></span>
          <span><strong><b>Enziu</b>Rooms</strong><small>Quản trị hệ thống</small></span>
        </Link>

        <nav className="system-admin-header__primary-nav" aria-label="Điều hướng EnziuRooms">
          <NavLink to={SYSTEM_ADMIN_OVERVIEW_PATH} end className={({ isActive }) => isActive ? "is-active" : ""}>Tổng quan</NavLink>
          <NavLink to={SYSTEM_ADMIN_HOTEL_EXPLORER_PATH} className={({ isActive }) => isActive ? "is-active" : ""}>Khách sạn</NavLink>
        </nav>

        <nav className="system-admin-header__nav" aria-label="Điều hướng quản trị hệ thống">
          {navigationGroups.map((group) => {
            const active = groupMatchesPath(group, location.pathname);
            if (group.direct) {
              const item = group.items[0];
              return <NavLink key={group.key} to={item.to} end={item.end} className={active ? "is-active" : ""}>{group.label}</NavLink>;
            }
            const expanded = openGroup === group.key;
            return (
              <div className={`system-admin-header__group ${active ? "is-active" : ""}`} key={group.key}>
                <button
                  ref={(node) => {
                    if (node) groupButtonRefs.current.set(group.key, node);
                    else groupButtonRefs.current.delete(group.key);
                  }}
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    setOpenGroup((current) => current === group.key ? "" : group.key);
                  }}
                  aria-expanded={expanded}
                  aria-haspopup="menu"
                  aria-controls={expanded ? "system-admin-desktop-menu" : undefined}
                >
                  {group.label}<ChevronDown size={15} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </nav>

        <div className="system-admin-header__actions">
          <Link className="system-admin-header__wallet" to="/admin/wallet" aria-label={`Ví EnziuRooms, số dư khả dụng ${money(walletBalance)}`}>
            <WalletCards size={19} aria-hidden="true" />
            <span><small>Ví EnziuRooms</small><strong>{money(walletBalance)}</strong></span>
          </Link>
          <NotificationBell admin />

          <div className="system-admin-header__account">
            <button
              ref={accountButtonRef}
              type="button"
              className="system-admin-header__account-button"
              onClick={() => {
                setOpenGroup("");
                setAccountOpen((value) => !value);
              }}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
            >
              <span className="system-admin-header__avatar"><AvatarImage source={user} alt={user?.fullName ?? "Ảnh đại diện quản trị viên"} fallback={avatarText} /></span>
              <span className="system-admin-header__account-copy"><strong>{user?.fullName ?? "Quản trị viên"}</strong><small>Quản trị hệ thống</small></span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {accountOpen ? (
              <div className="system-admin-header__account-menu" role="menu">
                <div><span className="system-admin-header__avatar large"><AvatarImage source={user} alt="" fallback={avatarText} /></span><span><strong>{user?.fullName ?? "Quản trị viên"}</strong><small>{user?.email ?? "Quản trị hệ thống"}</small></span></div>
                <button type="button" role="menuitem" onClick={handleLogout}><LogOut size={18} /><span>Đăng xuất</span></button>
              </div>
            ) : null}
          </div>

          <button
            ref={mobileButtonRef}
            type="button"
            className="system-admin-header__mobile-toggle"
            onClick={() => {
              setOpenGroup("");
              setAccountOpen(false);
              setMobileMenuOpen((current) => !current);
            }}
            aria-label={mobileMenuOpen ? "Đóng menu quản trị" : "Mở menu quản trị"}
            aria-expanded={mobileMenuOpen}
            aria-controls="system-admin-mobile-menu"
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? createPortal(
        <>
          <button
            type="button"
            className="system-admin-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Đóng menu quản trị"
          />
          <aside
            ref={mobilePanelRef}
            id="system-admin-mobile-menu"
            className="system-admin-mobile-drawer"
            aria-label="Menu quản trị trên thiết bị di động"
          >
            <div className="system-admin-mobile-drawer__head">
              <span><strong>Điều hành EnziuRooms</strong><small>Quản trị hệ thống</small></span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Đóng menu quản trị"><X size={20} /></button>
            </div>
            <Link className="system-admin-mobile-drawer__wallet" to="/admin/wallet"><WalletCards size={19} /><span><small>Ví EnziuRooms</small><strong>{money(walletBalance)}</strong></span></Link>
            <nav>
              <section>
                <h2>EnziuRooms Admin</h2>
                <NavLink to={SYSTEM_ADMIN_OVERVIEW_PATH} end className={({ isActive }) => isActive ? "is-active" : ""}><LayoutDashboard size={18} /><span>Tổng quan</span></NavLink>
                <NavLink to={SYSTEM_ADMIN_HOTEL_EXPLORER_PATH} className={({ isActive }) => isActive ? "is-active" : ""}><Building2 size={18} /><span>Khách sạn</span></NavLink>
              </section>
              {navigationGroups.map((group) => (
                <section key={group.key}>
                  <h2>{group.label}</h2>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? "is-active" : ""}><Icon size={18} /><span>{item.label}</span></NavLink>;
                  })}
                </section>
              ))}
            </nav>
          </aside>
        </>,
        document.body,
      ) : null}
      {activeDropdownGroup && dropdownPosition ? createPortal(
        <div
          ref={desktopDropdownRef}
          id="system-admin-desktop-menu"
          className="system-admin-header__dropdown"
          role="menu"
          aria-label={activeDropdownGroup.label}
          style={dropdownPosition}
        >
          {activeDropdownGroup.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} role="menuitem" className={({ isActive }) => isActive ? "is-active" : ""}>
                <span><Icon size={18} aria-hidden="true" /></span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </NavLink>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </header>
  );
}
