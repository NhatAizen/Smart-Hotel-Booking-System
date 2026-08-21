import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import enziuLogo from "../../assets/enziu-logo.png";
import authAccountResort from "../../assets/auth-account-resort.jpg";
import "../../styles/pages/auth-enziu-login.css";

function formatLockTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remain).padStart(2, "0")}` : `${remain}s`;
}

export default function EnziuLoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const [form, setForm] = useState({ identifier: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => {
    const message = sessionStorage.getItem("enziuroomsAuthNotice") ?? "";
    sessionStorage.removeItem("enziuroomsAuthNotice");
    return message;
  });
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const lockSeconds = useMemo(
    () => Math.max(0, Math.ceil((lockUntil - now) / 1000)),
    [lockUntil, now],
  );

  useEffect(() => {
    if (!lockUntil || lockUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  function handleChange(event) {
    const { name, value } = event.target;
    setError("");
    setNotice("");
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (lockSeconds > 0) return;

    setError("");
    setNotice("");

    try {
      const user = await login(
        {
          identifier: form.identifier.trim(),
          password: form.password,
        },
        { rememberMe },
      );

      if (user.role === "SYSTEM_ADMIN") {
        navigate("/admin", { replace: true });
        return;
      }

      if (user.role === "HOTEL_ADMIN") {
        navigate("/hotel-admin", { replace: true });
        return;
      }

      const pendingBookingUrl = localStorage.getItem("enziuroomsPendingBookingUrl");
      if (pendingBookingUrl) {
        localStorage.removeItem("enziuroomsPendingBookingUrl");
        navigate(pendingBookingUrl, { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (requestError) {
      const data = requestError.response?.data;

      if (data?.code === "LOGIN_TEMPORARILY_LOCKED") {
        const retryAfter = Number(
          data.retryAfterSeconds
            ?? requestError.response?.headers?.["retry-after"]
            ?? 60,
        );
        setNow(Date.now());
        setLockUntil(Date.now() + Math.max(1, retryAfter) * 1000);
        setError("Bạn đã nhập sai mật khẩu quá nhiều lần. Đăng nhập đang bị khóa tạm thời.");
        return;
      }

      setError(
        data?.message
          ?? requestError.message
          ?? "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.",
      );
    }
  }

  return (
    <main className="auth-enziu-login-page">
      <section className="auth-enziu-login-shell">
        <aside
          className="auth-enziu-login-visual"
          aria-label="EnziuRooms"
          style={{ "--enziu-account-resort": `url(${authAccountResort})` }}
        >
          <div className="auth-enziu-login-visual-overlay" />

          <div className="auth-enziu-login-visual-content">
            <span className="auth-enziu-login-visual-kicker">STAY COMFORT, LIVE EASY</span>
            <h1>
              Đặt phòng thông minh.
              <br />
              Trải nghiệm trọn vẹn.
            </h1>
            <p>
              Một tài khoản EnziuRooms để quản lý booking, voucher, đánh giá
              và toàn bộ hành trình lưu trú của bạn.
            </p>

            <div className="auth-enziu-login-visual-pills">
              <span>Khách sạn đã kiểm duyệt</span>
              <span>Ưu đãi dành riêng</span>
              <span>Thanh toán an toàn</span>
            </div>
          </div>
        </aside>

        <section className="auth-enziu-login-panel">
          <Link to="/login" className="auth-enziu-login-back">
            <ArrowLeft size={18} />
            Quay lại lựa chọn đăng nhập
          </Link>

          <div className="auth-enziu-login-panel-inner">
            <div className="auth-enziu-login-brand">
              <img src={enziuLogo} alt="EnziuRooms" />
            </div>

            <div className="auth-enziu-login-heading">
              <span>TÀI KHOẢN ENZIUROOMS</span>
              <h2>Chào mừng bạn trở lại</h2>
              <p>Đăng nhập bằng tên đăng nhập hoặc email của bạn.</p>
            </div>

            {notice ? <div className="auth-enziu-login-notice">{notice}</div> : null}

            {error ? (
              <div className="auth-enziu-login-error">
                <div>
                  <strong>{lockSeconds > 0 ? "Tạm khóa đăng nhập" : "Không thể đăng nhập"}</strong>
                  <span>{error}</span>
                </div>
                {lockSeconds > 0 ? (
                  <b>
                    <Clock3 size={15} />
                    {formatLockTime(lockSeconds)}
                  </b>
                ) : null}
              </div>
            ) : null}

            <form className="auth-enziu-login-form" onSubmit={handleSubmit}>
              <label>
                <span>Tên đăng nhập / Email</span>
                <div className="auth-enziu-login-input">
                  <UserRound size={20} />
                  <input
                    type="text"
                    name="identifier"
                    value={form.identifier}
                    onChange={handleChange}
                    placeholder="Nhập tên đăng nhập hoặc email"
                    autoComplete="username"
                    required
                    autoFocus
                  />
                </div>
              </label>

              <label>
                <span>Mật khẩu</span>
                <div className="auth-enziu-login-input">
                  <LockKeyhole size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-enziu-login-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>

              <div className="auth-enziu-login-options">
                <label className="auth-enziu-login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>

                <Link to="/forgot-password">Quên mật khẩu?</Link>
              </div>

              <button
                className="auth-enziu-login-submit"
                type="submit"
                disabled={loading || lockSeconds > 0}
              >
                {lockSeconds > 0
                  ? `Thử lại sau ${formatLockTime(lockSeconds)}`
                  : loading
                    ? "Đang đăng nhập..."
                    : "Đăng nhập"}
                {!loading && lockSeconds === 0 ? <ArrowRight size={19} /> : null}
              </button>
            </form>

            <div className="auth-enziu-login-register">
              <span>Chưa có tài khoản?</span>
              <Link to="/register">Đăng ký tài khoản miễn phí</Link>
            </div>

            <div className="auth-enziu-login-security">
              <ShieldCheck size={18} />
              <span>
                Hệ thống tự khóa đăng nhập tạm thời sau nhiều lần nhập sai để bảo vệ tài khoản.
              </span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}