import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Hotel,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

function SocialLoginButton({
  provider,
  label,
  onUnavailable,
}) {
  function handleClick() {
    const envName =
      provider === "google"
        ? "VITE_GOOGLE_OAUTH_URL"
        : "VITE_FACEBOOK_OAUTH_URL";

    const oauthUrl = import.meta.env[envName];

    if (oauthUrl) {
      window.location.assign(oauthUrl);
      return;
    }

    onUnavailable(
      `${label} hiện chưa khả dụng. `
        + "Vui lòng đăng nhập bằng email hoặc thử lại sau.",
    );
  }

  return (
    <button
      type="button"
      className={`auth-social-button ${provider}`}
      onClick={handleClick}
    >
      <span
        className="auth-social-mark"
        aria-hidden="true"
      >
        {provider === "google" ? "G" : "f"}
      </span>

      {label}
    </button>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    login,
    loading,
  } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    rememberMe,
    setRememberMe,
  ] = useState(true);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => {
    const message = sessionStorage.getItem("enziuroomsAuthNotice") ?? "";
    sessionStorage.removeItem("enziuroomsAuthNotice");
    return message;
  });

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setError("");
    setNotice("");

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setNotice("");

    try {
      const user = await login(
        form,
        {
          rememberMe,
        },
      );

      /*
       * SYSTEM_ADMIN vẫn vào trang quản trị hệ thống.
       */
      if (user.role === "SYSTEM_ADMIN") {
        navigate(
          "/admin",
          {
            replace: true,
          },
        );

        return;
      }

      /*
       * HOTEL_ADMIN vẫn vào trang quản lý khách sạn.
       */
      if (user.role === "HOTEL_ADMIN") {
        navigate(
          "/hotel-admin",
          {
            replace: true,
          },
        );

        return;
      }

      /*
       * Chỉ CUSTOMER quay về trang chủ.
       * Navbar tại trang chủ sẽ tự đổi thành avatar,
       * tên người dùng, thông báo và các menu khách hàng.
       */
      const pendingBookingUrl = localStorage.getItem(
        "enziuroomsPendingBookingUrl",
      );

      if (pendingBookingUrl) {
        localStorage.removeItem("enziuroomsPendingBookingUrl");
        navigate(pendingBookingUrl, { replace: true });
        return;
      }

      navigate(
        "/",
        {
          replace: true,
        },
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? requestError.message
          ?? "Đăng nhập thất bại. "
            + "Vui lòng kiểm tra lại thông tin.",
      );
    }
  }

  return (
    <main className="auth-page auth-page-login">
      <section className="auth-shell">
        <aside className="auth-showcase">
          <Link
            to="/"
            className="auth-brand auth-brand-light"
          >
            <span>
              <Hotel size={27} />
            </span>

            <strong>EnziuRooms</strong>
          </Link>

          <div className="auth-showcase-content">
            <span className="auth-kicker">
              <Sparkles size={16} />
              Nền tảng đặt phòng thông minh
            </span>

            <h1>
              Khám phá kỳ nghỉ phù hợp với bạn.
            </h1>

            <p>
              Tìm kiếm khách sạn đã được kiểm duyệt,
              đặt phòng thuận tiện và quản lý hành trình
              trên một hệ thống duy nhất.
            </p>

            <div className="auth-benefits">
              <div>
                <ShieldCheck size={20} />

                <span>
                  Khách sạn và phòng được quản trị viên
                  xét duyệt
                </span>
              </div>

              <div>
                <CheckCircle2 size={20} />

                <span>
                  Xác thực email và bảo vệ tài khoản
                  bằng JWT
                </span>
              </div>

              <div>
                <Sparkles size={20} />

                <span>
                  Trợ lý AI hỗ trợ tìm kiếm và gợi ý
                  khách sạn
                </span>
              </div>
            </div>
          </div>

          <div className="auth-showcase-stat">
            <strong>EnziuRooms</strong>

            <span>
              Đặt phòng nhanh chóng · Minh bạch · An toàn
            </span>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-mobile-brand">
            <Link
              to="/"
              className="auth-brand"
            >
              <span>
                <Hotel size={24} />
              </span>

              <strong>EnziuRooms</strong>
            </Link>
          </div>

          <div className="auth-form-heading">
            <span className="auth-kicker dark">
              CHÀO MỪNG TRỞ LẠI
            </span>

            <h2>Đăng nhập tài khoản</h2>

            <p>
              Tiếp tục hành trình đặt phòng cùng
              EnziuRooms.
            </p>
          </div>

          {error ? (
            <div className="alert alert-error">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="alert alert-info">
              {notice}
            </div>
          ) : null}

          <div className="auth-social-grid">
            <SocialLoginButton
              provider="google"
              label="Tiếp tục với Google"
              onUnavailable={setNotice}
            />

            <SocialLoginButton
              provider="facebook"
              label="Tiếp tục với Facebook"
              onUnavailable={setNotice}
            />
          </div>

          <div className="auth-divider">
            <span>
              hoặc đăng nhập bằng email
            </span>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >
            <label className="auth-field">
              <span>Email</span>

              <div className="auth-input-wrap">
                <Mail size={19} />

                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="name@gmail.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Mật khẩu</span>

              <div className="auth-input-wrap">
                <LockKeyhole size={19} />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (value) => !value,
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Ẩn mật khẩu"
                      : "Hiện mật khẩu"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </label>

            <div className="auth-form-options">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) =>
                    setRememberMe(
                      event.target.checked,
                    )
                  }
                />

                <span>
                  Ghi nhớ đăng nhập
                </span>
              </label>

              <Link to="/forgot-password">
                Quên mật khẩu?
              </Link>
            </div>

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Đang đăng nhập..."
                : "Đăng nhập"}

              {!loading ? (
                <ArrowRight size={19} />
              ) : null}
            </button>
          </form>

          <p className="auth-switch">
            Chưa có tài khoản?{" "}

            <Link to="/register">
              Đăng ký miễn phí
            </Link>
          </p>

          <p className="auth-legal">
            Bằng việc tiếp tục, bạn đồng ý với
            Điều khoản sử dụng và Chính sách bảo mật
            của EnziuRooms.
          </p>
        </section>
      </section>
    </main>
  );
}
