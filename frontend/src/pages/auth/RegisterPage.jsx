import {
  ArrowRight,
  AtSign,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import registerResortImage from "../../assets/auth-account-resort.jpg";
import enziuLogo from "../../assets/enziu-logo.png";
import "../../styles/pages/auth-register.css";

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{3,29}$/;

function getPasswordChecks(password) {
  return {
    length: password.length >= 8 && password.length <= 72,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    noSpace: password.length > 0 && !/\s/.test(password),
  };
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const passwordChecks = useMemo(() => getPasswordChecks(form.password), [form.password]);
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  function handleChange(event) {
    const { name, value } = event.target;
    setError("");
    setMessage("");
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const username = form.username.trim();
    const email = form.email.trim();

    if (!USERNAME_PATTERN.test(username)) {
      setError("Tên đăng nhập phải từ 4–30 ký tự, bắt đầu bằng chữ hoặc số và chỉ dùng chữ không dấu, số, dấu chấm, _ hoặc -.");
      return;
    }

    if (!passwordValid) {
      setError("Mật khẩu phải có ít nhất 8 ký tự, chữ hoa, chữ thường, số, ký tự đặc biệt và không có khoảng trắng.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không trùng khớp.");
      return;
    }

    if (!acceptedTerms) {
      setError("Bạn cần đồng ý với điều khoản sử dụng để đăng ký.");
      return;
    }

    try {
      const result = await register({
        fullName: form.fullName.trim(),
        username,
        email: email || null,
        password: form.password,
      });

      setMessage(
        result?.message
          ?? (email
            ? "Đăng ký thành công. Hãy kiểm tra email để xác thực tài khoản."
            : "Đăng ký thành công. Bạn có thể đăng nhập bằng tên đăng nhập."),
      );

      window.setTimeout(() => navigate("/login/enziurooms", { replace: true }), 2600);
    } catch (requestError) {
      const data = requestError.response?.data;
      const validation = data?.validationErrors;
      const firstValidation = validation ? Object.values(validation)[0] : null;
      setError(firstValidation ?? data?.message ?? "Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.");
    }
  }

  return (
    <main className="enziu-register-page">
      <section className="enziu-register-shell">
        <aside
          className="enziu-register-visual"
          style={{ "--enziu-register-visual-image": `url(${registerResortImage})` }}
          aria-label="EnziuRooms"
        >
          <div className="enziu-register-visual-overlay" />

          <div className="enziu-register-visual-content">
            <img src={enziuLogo} alt="EnziuRooms" className="enziu-register-visual-logo" />

            <h1>
              Trải nghiệm lưu trú
              <br />
              thông minh & <strong>tiện lợi</strong>
            </h1>

            <p>
              EnziuRooms giúp bạn quản lý đặt phòng dễ dàng, lưu ưu đãi và
              tận hưởng hành trình nghỉ dưỡng trọn vẹn.
            </p>

            <div className="enziu-register-visual-divider" />

            <div className="enziu-register-feature-list">
              <div>
                <span className="enziu-register-feature-icon"><CheckCircle2 size={18} /></span>
                <p>
                  <b>Quản lý đặt phòng hiệu quả</b>
                  <small>Theo dõi booking và hành trình lưu trú trong vài giây.</small>
                </p>
              </div>

              <div>
                <span className="enziu-register-feature-icon"><ShieldCheck size={18} /></span>
                <p>
                  <b>Bảo mật & an toàn</b>
                  <small>Mật khẩu mạnh.</small>
                </p>
              </div>

              <div>
                <span className="enziu-register-feature-icon"><Sparkles size={18} /></span>
                <p>
                  <b>Ưu đãi dành riêng</b>
                  <small>Lưu voucher và những khách sạn bạn yêu thích.</small>
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="enziu-register-panel">
          <div className="enziu-register-card">
            <div className="enziu-register-security-pill">
              <ShieldCheck size={15} />
              Tạo tài khoản an toàn
            </div>

            <div className="enziu-register-heading">
              <h2>Tạo tài khoản</h2>
              <p>Email không bắt buộc. Bạn có thể đăng nhập bằng tên đăng nhập.</p>
            </div>

            {error ? <div className="enziu-register-alert enziu-register-alert-error">{error}</div> : null}
            {message ? <div className="enziu-register-alert enziu-register-alert-success">{message}</div> : null}

            <form className="enziu-register-form" onSubmit={handleSubmit}>
              <label className="enziu-register-field">
                <span>Họ và tên</span>
                <div className="enziu-register-input">
                  <UserRound size={19} />
                  <input
                    type="text"
                    name="fullName"
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder="Nhập họ và tên của bạn"
                    autoComplete="name"
                    required
                  />
                </div>
              </label>

              <label className="enziu-register-field">
                <span>Tên đăng nhập</span>
                <div className="enziu-register-input">
                  <AtSign size={19} />
                  <input
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="Nhập tên đăng nhập"
                    autoComplete="username"
                    minLength={4}
                    maxLength={30}
                    required
                  />
                </div>
                <small>4–30 ký tự, chỉ dùng chữ không dấu, số, dấu chấm, _ hoặc -</small>
              </label>

              <label className="enziu-register-field">
                <span>
                  Email <em>(không bắt buộc)</em>
                </span>
                <div className="enziu-register-input">
                  <Mail size={19} />
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Nhập email của bạn"
                    autoComplete="email"
                  />
                </div>
                <small className="enziu-register-note">
                  <Info size={13} />
                  Không nhập email vẫn đăng ký được; khi đó bạn đăng nhập bằng tên đăng nhập.
                </small>
              </label>

              <label className="enziu-register-field">
                <span>Mật khẩu</span>
                <div className="enziu-register-input">
                  <LockKeyhole size={19} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Nhập mật khẩu"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                  <button
                    type="button"
                    className="enziu-register-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>

                <div className="enziu-register-password-strength" aria-label="Độ mạnh mật khẩu">
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <span key={level} className={passwordScore >= level ? "active" : ""} />
                  ))}
                </div>

                <div className="enziu-register-password-rules">
                  <span className={passwordChecks.length ? "ok" : ""}><Check size={13} /> 8–72 ký tự</span>
                  <span className={passwordChecks.upper ? "ok" : ""}><Check size={13} /> Có chữ hoa</span>
                  <span className={passwordChecks.lower ? "ok" : ""}><Check size={13} /> Có chữ thường</span>
                  <span className={passwordChecks.number ? "ok" : ""}><Check size={13} /> Có số</span>
                  <span className={passwordChecks.special ? "ok" : ""}><Check size={13} /> Có ký tự đặc biệt</span>
                  <span className={passwordChecks.noSpace ? "ok" : ""}><Check size={13} /> Không khoảng trắng</span>
                </div>
              </label>

              <label className="enziu-register-field">
                <span>Xác nhận mật khẩu</span>
                <div
                  className={`enziu-register-input ${
                    form.confirmPassword && form.confirmPassword === form.password
                      ? "enziu-register-input-valid"
                      : ""
                  }`}
                >
                  <LockKeyhole size={19} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Nhập lại mật khẩu"
                    autoComplete="new-password"
                    required
                  />
                  {form.confirmPassword && form.confirmPassword === form.password ? (
                    <CheckCircle2 size={18} className="enziu-register-valid-icon" />
                  ) : null}
                </div>
              </label>

              <label className="enziu-register-terms">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>
                  Tôi đồng ý với <a href="#terms">Điều khoản sử dụng</a> và{" "}
                  <a href="#privacy">Chính sách bảo mật</a>.
                </span>
              </label>

              <button className="enziu-register-submit" type="submit" disabled={loading || Boolean(message)}>
                {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
                {!loading ? <ArrowRight size={18} /> : null}
              </button>
            </form>

            <div className="enziu-register-footer">
              <span>Đã có tài khoản?</span>
              <Link to="/login/enziurooms">Đăng nhập</Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}