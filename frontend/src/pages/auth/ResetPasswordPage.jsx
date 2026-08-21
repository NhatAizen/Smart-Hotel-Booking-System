import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Hotel,
  KeyRound,
  LockKeyhole,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  resetPasswordRequest,
} from "../../services/authService";

function getPasswordStrength(password) {
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  }

  if (/[a-z]/.test(password) && /\d/.test(password)) {
    score += 1;
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  return score;
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token =
    searchParams.get("token")?.trim() ?? "";

  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const passwordStrength = useMemo(
    () =>
      getPasswordStrength(
        form.newPassword,
      ),
    [form.newPassword],
  );

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setError("");
    setMessage("");

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!token) {
      setError(
        "Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu token.",
      );

      return;
    }

    const strongPassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,72}$/.test(
        form.newPassword,
      );

    if (!strongPassword) {
      setError(
        "Mật khẩu phải từ 8–72 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt và không chứa khoảng trắng.",
      );

      return;
    }

    if (
      form.newPassword
      !== form.confirmPassword
    ) {
      setError(
        "Mật khẩu xác nhận không trùng khớp.",
      );

      return;
    }

    setLoading(true);

    try {
      const response =
        await resetPasswordRequest(
          token,
          form.newPassword,
        );

      setMessage(
        response.message
        ?? "Đặt lại mật khẩu thành công.",
      );

      window.setTimeout(() => {
        navigate(
          "/login",
          {
            replace: true,
          },
        );
      }, 2200);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
        ?? requestError.response?.data?.detail
        ?? requestError.message
        ?? "Không thể đặt lại mật khẩu. Token có thể đã hết hạn hoặc đã được sử dụng.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="auth-page auth-simple-page">
        <section className="auth-simple-card">
          <Link
            to="/"
            className="auth-brand"
          >
            <span>
              <Hotel size={24} />
            </span>

            <strong>EnziuRooms</strong>
          </Link>

          <div className="auth-simple-icon">
            <KeyRound size={32} />
          </div>

          <h1>Liên kết không hợp lệ</h1>

          <p>
            Liên kết đặt lại mật khẩu không có
            token hoặc đã bị thay đổi.
          </p>

          <div className="alert alert-error">
            Vui lòng yêu cầu một liên kết đặt lại
            mật khẩu mới.
          </div>

          <Link
            to="/forgot-password"
            className="auth-submit"
          >
            Yêu cầu liên kết mới
          </Link>

          <Link
            to="/login/enziurooms"
            className="auth-back-link"
          >
            <ArrowLeft size={17} />
            Quay lại đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page auth-simple-page">
      <section className="auth-simple-card">
        <Link
          to="/"
          className="auth-brand"
        >
          <span>
            <Hotel size={24} />
          </span>

          <strong>EnziuRooms</strong>
        </Link>

        <div className="auth-simple-icon">
          {message ? (
            <CheckCircle2 size={34} />
          ) : (
            <KeyRound size={32} />
          )}
        </div>

        <h1>
          {message
            ? "Đặt lại mật khẩu thành công"
            : "Tạo mật khẩu mới"}
        </h1>

        <p>
          {message
            ? "Bạn sẽ được chuyển về trang đăng nhập."
            : "Nhập mật khẩu mới cho tài khoản EnziuRooms của bạn."}
        </p>

        {error ? (
          <div className="alert alert-error">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="alert alert-success">
            {message}
          </div>
        ) : null}

        {!message ? (
          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >
            <label className="auth-field">
              <span>Mật khẩu mới</span>

              <div className="auth-input-wrap">
                <LockKeyhole size={19} />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="newPassword"
                  value={form.newPassword}
                  onChange={handleChange}
                  placeholder="Tối thiểu 8 ký tự"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
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

              <div
                className="auth-password-strength"
                aria-label="Độ mạnh mật khẩu"
              >
                {[1, 2, 3, 4].map(
                  (level) => (
                    <span
                      key={level}
                      className={
                        passwordStrength >= level
                          ? "active"
                          : ""
                      }
                    />
                  ),
                )}
              </div>

              <small>
                Bắt buộc 8–72 ký tự, có chữ hoa, chữ thường,
                số, ký tự đặc biệt và không có khoảng trắng.
              </small>
            </label>

            <label className="auth-field">
              <span>Xác nhận mật khẩu mới</span>

              <div className="auth-input-wrap">
                <LockKeyhole size={19} />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
            </label>

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              <KeyRound size={18} />

              {loading
                ? "Đang đặt lại..."
                : "Đặt lại mật khẩu"}
            </button>
          </form>
        ) : null}

        <Link
          to="/login/enziurooms"
          className="auth-back-link"
        >
          <ArrowLeft size={17} />
          Quay lại đăng nhập
        </Link>
      </section>
    </main>
  );
}