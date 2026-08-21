import {
  ArrowRight,
  Headphones,
  Heart,
  Hotel,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import enziuLogo from "../../assets/enziu-logo.png";

function GoogleMark() {
  return (
    <svg className="auth-provider-logo-svg" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12S17.4 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4c-7.7 0-14.3 4.3-17.7 10.7Z" />
      <path fill="#4CAF50" d="M24 44c5.1 0 9.7-2 13.2-5.2l-6.1-5.1C29.1 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.7 39.6 16.3 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.2 5.7l6.1 5.1C36.8 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5Z" />
    </svg>
  );
}

function FacebookMark() {
  return <span className="auth-facebook-mark" aria-hidden="true">f</span>;
}

function ProviderCard({ provider, title, description, buttonLabel, onClick, children }) {
  return (
    <article className={`auth-provider-card auth-provider-card-${provider}`}>
      <div className="auth-provider-card-decor" aria-hidden="true" />
      <div className={`auth-provider-logo-shell${provider === "enziu" ? " auth-provider-logo-enziu" : ""}`}>
        {children}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" className="auth-provider-action" onClick={onClick}>
        <span>{buttonLabel}</span>
        <ArrowRight size={19} />
      </button>
    </article>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState(() => {
    const message = sessionStorage.getItem("enziuroomsAuthNotice") ?? "";
    sessionStorage.removeItem("enziuroomsAuthNotice");
    return message;
  });

  function handleSocialLogin(provider, label) {
    const envName = provider === "google" ? "VITE_GOOGLE_OAUTH_URL" : "VITE_FACEBOOK_OAUTH_URL";
    const oauthUrl = import.meta.env[envName];

    if (oauthUrl) {
      window.location.assign(oauthUrl);
      return;
    }

    setNotice(`${label} hiện chưa khả dụng. Bạn có thể đăng nhập bằng tài khoản EnziuRooms.`);
  }

  return (
    <main className="auth-login-hub-page">
      <div className="auth-login-hub-shell">
        <section className="auth-login-hero" aria-label="EnziuRooms">
          <div className="auth-login-hero-overlay" />
          <div className="auth-login-hero-content">
            <Link to="/" className="auth-login-hero-brand" aria-label="Về trang chủ EnziuRooms">
              <img src={enziuLogo} alt="EnziuRooms" />
            </Link>

            <h1>Đặt phòng thông minh,<br />trải nghiệm trọn vẹn</h1>

            <div className="auth-login-hero-benefits">
              <div>
                <span><Hotel size={20} /></span>
                <p><strong>Đa dạng lựa chọn</strong><small>Hàng ngàn khách sạn chất lượng</small></p>
              </div>
              <div>
                <span><Tag size={20} /></span>
                <p><strong>Giá tốt mỗi ngày</strong><small>Cam kết giá tốt nhất cho bạn</small></p>
              </div>
              <div>
                <span><ShieldCheck size={20} /></span>
                <p><strong>Đặt phòng an toàn</strong><small>Bảo mật thông tin, thanh toán an toàn</small></p>
              </div>
            </div>
          </div>
        </section>

        {notice ? <div className="auth-hub-notice">{notice}</div> : null}

        <section className="auth-provider-grid" aria-label="Chọn phương thức đăng nhập">
          <ProviderCard
            provider="enziu"
            title="Tiếp tục với EnziuRooms"
            description="Đăng nhập nhanh chóng và an toàn bằng tài khoản EnziuRooms của bạn."
            buttonLabel="Tiếp tục với EnziuRooms"
            onClick={() => navigate("/login/enziurooms")}
          >
            <img src={enziuLogo} alt="Logo EnziuRooms" />
          </ProviderCard>

          <ProviderCard
            provider="google"
            title="Tiếp tục với Google"
            description="Đăng nhập nhanh chóng và an toàn bằng tài khoản Google của bạn."
            buttonLabel="Tiếp tục với Google"
            onClick={() => handleSocialLogin("google", "Google")}
          >
            <GoogleMark />
          </ProviderCard>

          <ProviderCard
            provider="facebook"
            title="Tiếp tục với Facebook"
            description="Đăng nhập nhanh chóng và an toàn bằng tài khoản Facebook của bạn."
            buttonLabel="Tiếp tục với Facebook"
            onClick={() => handleSocialLogin("facebook", "Facebook")}
          >
            <FacebookMark />
          </ProviderCard>
        </section>

        <footer className="auth-login-hub-footer">
          <span><ShieldCheck size={17} /> Bảo mật thông tin tuyệt đối</span>
          <i aria-hidden="true" />
          <span><Headphones size={17} /> Hỗ trợ 24/7</span>
          <i aria-hidden="true" />
          <span><Heart size={17} /> Trải nghiệm đặt phòng tốt nhất</span>
        </footer>
      </div>
    </main>
  );
}
