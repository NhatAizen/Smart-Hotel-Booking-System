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
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function SocialRegisterButton({ provider, label, onUnavailable }) {
  function handleClick() {
    const envName =
      provider === "google" ? "VITE_GOOGLE_OAUTH_URL" : "VITE_FACEBOOK_OAUTH_URL";
    const oauthUrl = import.meta.env[envName];

    if (oauthUrl) {
      window.location.assign(oauthUrl);
      return;
    }

    onUnavailable(`${label} chưa được cấu hình ở backend. Giao diện đã sẵn sàng để kết nối OAuth.`);
  }

  return (
    <button type="button" className={`auth-social-button ${provider}`} onClick={handleClick}>
      <span className="auth-social-mark" aria-hidden="true">{provider === "google" ? "G" : "f"}</span>
      {label}
    </button>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  const passwordStrength = useMemo(
    () => getPasswordStrength(form.password),
    [form.password],
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setError("");
    setMessage("");
    setNotice("");
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.password !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không trùng khớp.");
      return;
    }

    if (passwordStrength < 3) {
      setError("Mật khẩu cần ít nhất 8 ký tự, có chữ hoa, chữ thường và số.");
      return;
    }

    if (!acceptedTerms) {
      setError("Bạn cần đồng ý với điều khoản sử dụng để đăng ký.");
      return;
    }

    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      setMessage("Đăng ký thành công. EnziuRooms đã gửi liên kết xác thực đến email của bạn.");
      window.setTimeout(() => navigate("/login", { replace: true }), 2600);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          "Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.",
      );
    }
  }

  return (
    <main className="auth-page auth-page-register">
      <section className="auth-shell auth-shell-register">
        <aside className="auth-showcase">
          <Link to="/" className="auth-brand auth-brand-light">
            <span><Hotel size={27} /></span>
            <strong>EnziuRooms</strong>
          </Link>

          <div className="auth-showcase-content">
            <span className="auth-kicker"><Sparkles size={16} /> Bắt đầu hành trình của bạn</span>
            <h1>Một tài khoản cho toàn bộ trải nghiệm đặt phòng.</h1>
            <p>
              Lưu khách sạn yêu thích, theo dõi đơn đặt phòng, nhận thông báo
              và được trợ lý AI hỗ trợ tìm nơi lưu trú phù hợp.
            </p>

            <div className="auth-benefits">
              <div><CheckCircle2 size={20} /><span>Tìm kiếm và so sánh khách sạn thuận tiện</span></div>
              <div><ShieldCheck size={20} /><span>Xác thực email để bảo vệ tài khoản</span></div>
              <div><Sparkles size={20} /><span>Nhận gợi ý cá nhân hóa từ Gemini AI</span></div>
            </div>
          </div>

          <div className="auth-showcase-stat">
            <strong>Đăng ký miễn phí</strong>
            <span>Không thu phí tạo tài khoản khách hàng</span>
          </div>
        </aside>

        <section className="auth-form-panel auth-form-panel-register">
          <div className="auth-mobile-brand">
            <Link to="/" className="auth-brand"><span><Hotel size={24} /></span><strong>EnziuRooms</strong></Link>
          </div>

          <div className="auth-form-heading">
            <span className="auth-kicker dark">TẠO TÀI KHOẢN CUSTOMER</span>
            <h2>Đăng ký EnziuRooms</h2>
            <p>Chỉ mất vài phút để bắt đầu tìm kiếm và đặt phòng.</p>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}
          {message ? <div className="alert alert-success">{message}</div> : null}
          {notice ? <div className="alert alert-info">{notice}</div> : null}

          <div className="auth-social-grid">
            <SocialRegisterButton provider="google" label="Đăng ký với Google" onUnavailable={setNotice} />
            <SocialRegisterButton provider="facebook" label="Đăng ký với Facebook" onUnavailable={setNotice} />
          </div>

          <div className="auth-divider"><span>hoặc đăng ký bằng email</span></div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Họ và tên</span>
              <div className="auth-input-wrap">
                <UserRound size={19} />
                <input type="text" name="fullName" value={form.fullName} onChange={handleChange} placeholder="Nguyễn Văn A" autoComplete="name" required />
              </div>
            </label>

            <label className="auth-field">
              <span>Email</span>
              <div className="auth-input-wrap">
                <Mail size={19} />
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="name@gmail.com" autoComplete="email" required />
              </div>
            </label>

            <label className="auth-field">
              <span>Mật khẩu</span>
              <div className="auth-input-wrap">
                <LockKeyhole size={19} />
                <input type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" minLength={8} required />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <div className="auth-password-strength" aria-label="Độ mạnh mật khẩu">
                {[1, 2, 3, 4].map((level) => <span key={level} className={passwordStrength >= level ? "active" : ""} />)}
              </div>
              <small>Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.</small>
            </label>

            <label className="auth-field">
              <span>Xác nhận mật khẩu</span>
              <div className="auth-input-wrap">
                <LockKeyhole size={19} />
                <input type={showPassword ? "text" : "password"} name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Nhập lại mật khẩu" autoComplete="new-password" required />
              </div>
            </label>

            <label className="auth-checkbox auth-terms">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
              <span>Tôi đồng ý với <a href="#terms">Điều khoản sử dụng</a> và <a href="#privacy">Chính sách bảo mật</a>.</span>
            </label>

            <button className="auth-submit" type="submit" disabled={loading || Boolean(message)}>
              {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
              {!loading ? <ArrowRight size={19} /> : null}
            </button>
          </form>

          <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link></p>
        </section>
      </section>
    </main>
  );
}
