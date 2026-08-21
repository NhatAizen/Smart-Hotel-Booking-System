import { ArrowLeft, Hotel, Mail, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { forgotPasswordRequest } from "../../services/authService";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await forgotPasswordRequest(email.trim());
      setMessage(response.message ?? "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.");
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể gửi yêu cầu đặt lại mật khẩu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-simple-page">
      <section className="auth-simple-card">
        <Link to="/" className="auth-brand"><span><Hotel size={24} /></span><strong>EnziuRooms</strong></Link>
        <div className="auth-simple-icon"><Mail size={32} /></div>
        <h1>Quên mật khẩu?</h1>
        <p>Nhập email đã đăng ký. Hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu nếu tài khoản tồn tại.</p>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {message ? <div className="alert alert-success">{message}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email đã đăng ký</span>
            <div className="auth-input-wrap">
              <Mail size={19} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" autoComplete="email" required />
            </div>
          </label>
          <button className="auth-submit" type="submit" disabled={loading}>
            <Send size={18} /> {loading ? "Đang gửi..." : "Gửi hướng dẫn"}
          </button>
        </form>

        <Link to="/login/enziurooms" className="auth-back-link"><ArrowLeft size={17} /> Quay lại đăng nhập</Link>
      </section>
    </main>
  );
}
