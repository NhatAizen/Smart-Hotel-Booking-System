import {
  Bot,
  Building2,
  CalendarCheck2,
  ChevronDown,
  Heart,
  Handshake,
  LogIn,
  LogOut,
  Menu,
  Settings,
  Star,
  UserRound,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useAiAssistant } from "../../ai/AiAssistantContext";
import NotificationBell from "../notifications/NotificationBell";

export default function Navbar() {
  const navigate = useNavigate();
  const { openAssistant } = useAiAssistant();
  const location = useLocation();

  const {
    user,
    isAuthenticated,
    logout,
  } = useAuth();

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [accountMenuOpen, setAccountMenuOpen] =
    useState(false);

  const accountMenuRef = useRef(null);

  /*
   * =========================================================
   * CHUẨN HÓA ROLE
   * =========================================================
   *
   * Backend/Gateway có thể trả:
   *
   * CUSTOMER
   * ROLE_CUSTOMER
   * customer
   *
   * Sau khi chuẩn hóa đều thành:
   *
   * CUSTOMER
   */
  const normalizedRole = String(
    user?.role ?? "",
  )
    .replace(/^ROLE_/i, "")
    .trim()
    .toUpperCase();

  /*
   * Navbar tài khoản này chỉ dành cho CUSTOMER.
   */
  const isCustomer =
    isAuthenticated &&
    normalizedRole === "CUSTOMER";

  /*
   * Avatar của user.
   *
   * Hỗ trợ cả:
   * avatarUrl
   * avatar
   */
  const avatarUrl =
    user?.avatarUrl ??
    user?.avatar ??
    null;

  /*
   * =========================================================
   * ĐÓNG ACCOUNT MENU KHI CLICK RA NGOÀI
   * =========================================================
   */
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(
          event.target,
        )
      ) {
        setAccountMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setMobileOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    document.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      document.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, []);

  /*
   * Đóng menu khi chuyển trang.
   */
  useEffect(() => {
    setMobileOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  function closeMenu() {
    setMobileOpen(false);
    setAccountMenuOpen(false);
  }

  /*
   * =========================================================
   * ĐĂNG XUẤT
   * =========================================================
   */
  function handleLogout() {
    logout();

    closeMenu();

    navigate("/", {
      replace: true,
    });
  }

  /*
   * =========================================================
   * ACCOUNT DROPDOWN
   * =========================================================
   */
  function toggleAccountMenu() {
    setAccountMenuOpen(
      (current) => !current,
    );
  }

  /*
   * =========================================================
   * CHỮ ĐẠI DIỆN KHI KHÔNG CÓ AVATAR
   * =========================================================
   */
  function getAvatarText() {
    const fullName =
      user?.fullName?.trim();

    if (!fullName) {
      return "U";
    }

    return fullName
      .charAt(0)
      .toUpperCase();
  }

  return (
    <header className="main-header customer-main-header">
      <div className="top-navbar container customer-navbar">

        {/* ==================================================
            LOGO
        ================================================== */}
        <Link
          to="/"
          className="brand"
          onClick={closeMenu}
        >
          <span className="brand-icon">
            <Building2 size={25} />
          </span>

          <span>
            <strong>Enziu</strong>
            Rooms
          </span>
        </Link>

        {/* ==================================================
            MENU CHÍNH
        ================================================== */}
        <nav
          className={
            mobileOpen
              ? "nav-menu open"
              : "nav-menu"
          }
        >
          <NavLink
            to="/"
            end
            onClick={closeMenu}
          >
            Trang chủ
          </NavLink>

          <NavLink
            to="/hotels"
            onClick={closeMenu}
          >
            Khách sạn
          </NavLink>

          {/* ================================================
              MENU CUSTOMER
          ================================================ */}
          {isCustomer ? (
            <>
              <NavLink
                to="/customer/bookings"
                onClick={closeMenu}
              >
                <CalendarCheck2 size={17} />
                Đơn đặt phòng
              </NavLink>

              <NavLink
                to="/customer/notifications"
                onClick={closeMenu}
              >
                Thông báo
              </NavLink>

              <button
                type="button"
                className="nav-ai-trigger"
                onClick={() => {
                  closeMenu();
                  openAssistant({ clearHotelContext: true });
                }}
              >
                <Bot size={17} />
                Trợ lý AI
              </button>
            </>
          ) : null}
        </nav>

        {/* ==================================================
            ACTION BÊN PHẢI
        ================================================== */}
        <div className="nav-actions">

          {/* ================================================
              CUSTOMER ĐÃ LOGIN
          ================================================ */}
          {isCustomer ? (
            <>
              <NotificationBell />

              <div
                className="customer-account-menu"
                ref={accountMenuRef}
              >
                {/* ==========================================
                    NÚT AVATAR
                ========================================== */}
                <button
                  type="button"
                  className={
                    `account-button customer-account-button ${
                      accountMenuOpen
                        ? "active"
                        : ""
                    }`
                  }
                  onClick={toggleAccountMenu}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="account-avatar">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={
                          user?.fullName ??
                          "Ảnh đại diện"
                        }
                      />
                    ) : (
                      getAvatarText()
                    )}
                  </span>

                  <span className="account-info">
                    <strong>
                      {user?.fullName ??
                        "Người dùng"}
                    </strong>

                    <small>
                      Khách hàng
                    </small>
                  </span>

                  <ChevronDown
                    size={17}
                    className={
                      accountMenuOpen
                        ? "account-chevron open"
                        : "account-chevron"
                    }
                  />
                </button>

                {/* ==========================================
                    DROPDOWN ACCOUNT
                ========================================== */}
                {accountMenuOpen ? (
                  <div
                    className="account-dropdown"
                    role="menu"
                  >
                    {/* ======================================
                        USER INFO
                    ====================================== */}
                    <div className="account-dropdown-header">
                      <span className="account-dropdown-avatar">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={
                              user?.fullName ??
                              "Ảnh đại diện"
                            }
                          />
                        ) : (
                          getAvatarText()
                        )}
                      </span>

                      <div>
                        <strong>
                          {user?.fullName ??
                            "Người dùng"}
                        </strong>

                        <small>
                          {user?.email ??
                            "Khách hàng EnziuRooms"}
                        </small>
                      </div>
                    </div>

                    <div className="account-dropdown-divider" />

                    {/* ======================================
                        HỒ SƠ
                    ====================================== */}
                    <Link
                      to="/customer/profile"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <UserRound size={19} />

                      <span>
                        <strong>
                          Hồ sơ
                        </strong>

                        <small>
                          Thông tin tài khoản
                        </small>
                      </span>
                    </Link>

                    {/* ======================================
                        BOOKING
                    ====================================== */}
                    <Link
                      to="/customer/bookings"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <CalendarCheck2 size={19} />

                      <span>
                        <strong>
                          Đơn đặt phòng
                        </strong>

                        <small>
                          Lịch sử và trạng thái booking
                        </small>
                      </span>
                    </Link>

                    {/* ======================================
                        FAVORITES
                    ====================================== */}
                    <Link
                      to="/customer/favorites"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <Heart size={19} />

                      <span>
                        <strong>
                          Yêu thích
                        </strong>

                        <small>
                          Khách sạn đã lưu
                        </small>
                      </span>
                    </Link>

                    {/* ======================================
                        REVIEWS
                    ====================================== */}
                    <Link
                      to="/customer/reviews"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <Star size={19} />

                      <span>
                        <strong>
                          Đánh giá của tôi
                        </strong>

                        <small>
                          Xem và quản lý đánh giá
                        </small>
                      </span>
                    </Link>

                    {/* ======================================
                        WALLET
                    ====================================== */}
                    <Link
                      to="/customer/wallet"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <WalletCards size={19} />

                      <span>
                        <strong>
                          Ví Enziu
                        </strong>

                        <small>
                          Hoàn tiền, thanh toán và rút tiền
                        </small>
                      </span>
                    </Link>


                    {/* ======================================
                        PARTNER APPLICATION
                    ====================================== */}
                    <Link
                      to="/customer/partner"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <Handshake size={19} />

                      <span>
                        <strong>
                          Đăng ký làm đối tác
                        </strong>

                        <small>
                          Đưa khách sạn của bạn lên EnziuRooms
                        </small>
                      </span>
                    </Link>

                    {/* ======================================
                        SETTINGS
                    ====================================== */}
                    <Link
                      to="/customer/settings"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <Settings size={19} />

                      <span>
                        <strong>
                          Cài đặt
                        </strong>

                        <small>
                          Mật khẩu và bảo mật
                        </small>
                      </span>
                    </Link>

                    <div className="account-dropdown-divider" />

                    {/* ======================================
                        LOGOUT
                    ====================================== */}
                    <button
                      type="button"
                      className="account-dropdown-item account-dropdown-logout"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <LogOut size={19} />

                      <span>
                        <strong>
                          Đăng xuất
                        </strong>

                        <small>
                          Thoát khỏi tài khoản
                        </small>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : !isAuthenticated ? (
            /* ==============================================
               CHƯA LOGIN
            ============================================== */
            <>
              <Link
                to="/login"
                className="outline-button"
                onClick={closeMenu}
              >
                <LogIn size={18} />
                Đăng nhập
              </Link>

              <Link
                to="/register"
                className="primary-button"
                onClick={closeMenu}
              >
                <UserPlus size={18} />
                Đăng ký
              </Link>
            </>
          ) : null}

          {/* ==================================================
              MOBILE MENU
          ================================================== */}
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() =>
              setMobileOpen(
                (current) => !current,
              )
            }
            aria-label={
              mobileOpen
                ? "Đóng menu"
                : "Mở menu"
            }
          >
            {mobileOpen ? (
              <X />
            ) : (
              <Menu />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}