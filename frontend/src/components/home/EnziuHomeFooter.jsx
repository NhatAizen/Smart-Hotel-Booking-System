import {
  Bot,
  Globe2,
  Headphones,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import "./EnziuHomeFooter.css";

export default function EnziuHomeFooter() {
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();

  const role = String(user?.role ?? "")
    .replace(/^ROLE_/i, "")
    .toUpperCase();

  const isCustomer = isAuthenticated && role === "CUSTOMER";
  const isHotelAdmin = isAuthenticated && role === "HOTEL_ADMIN";

  return (
    <footer className="home-footer home-footer-pro">
      <div className="container home-footer-pro-grid">
        <div className="home-footer-pro-brand">
          <Link to="/" className="home-footer-pro-logo" aria-label="EnziuRooms">
            <span>Enziu</span>Rooms
          </Link>
          <p>
            Đặt phòng thông minh, minh bạch và thuận tiện từ lúc tìm nơi nghỉ đến khi hoàn tất chuyến đi.
          </p>
          <button
            type="button"
            className="home-footer-ai-link"
            onClick={() => openAssistant({ clearHotelContext: true })}
          >
            <Bot size={16} />
            Hỏi Enziu AI
          </button>
        </div>

        <div className="home-footer-pro-column">
          <h3>Khám phá</h3>
          <Link to="/hotels">Khách sạn</Link>
          <Link to="/hotels">Điểm đến</Link>
          <Link to="/about">Về EnziuRooms</Link>
          {isCustomer ? <Link to="/customer/rewards">Ưu đãi & hạng</Link> : <Link to="/login">Đăng nhập để xem ưu đãi</Link>}
        </div>

        <div className="home-footer-pro-column">
          <h3>Hỗ trợ</h3>
          <Link to="/help">Trung tâm trợ giúp</Link>
          <Link to="/#faq">Câu hỏi thường gặp</Link>
          <button
            type="button"
            className="home-footer-text-button"
            onClick={() => openAssistant({ clearHotelContext: true })}
          >
            Hỗ trợ bằng Enziu AI
          </button>
          {isCustomer ? <Link to="/customer/notifications">Thông báo</Link> : null}
        </div>

        <div className="home-footer-pro-column">
          <h3>Chính sách</h3>
          <Link to="/terms">Điều khoản sử dụng</Link>
          <Link to="/privacy">Chính sách bảo mật</Link>
          <Link to="/cancellation-policy">Chính sách hủy phòng</Link>
          <Link to="/refund-policy">Chính sách hoàn tiền</Link>
          <Link to="/payment-policy">Quy định thanh toán</Link>
        </div>

        <div className="home-footer-pro-column">
          <h3>Đối tác</h3>
          {isCustomer ? (
            <Link to="/customer/partner">Đăng ký làm đối tác</Link>
          ) : isHotelAdmin ? (
            <Link to="/hotel-admin/hotels">Quản lý khách sạn</Link>
          ) : (
            <Link to="/login">Đăng nhập để đăng ký</Link>
          )}
          <span>Quản lý khách sạn</span>
          <span>Vận hành booking</span>
        </div>

        <div className="home-footer-pro-column">
          <h3>Tài khoản</h3>
          {isCustomer ? (
            <>
              <Link to="/customer/bookings">Đơn đặt phòng</Link>
              <Link to="/customer/favorites">Yêu thích</Link>
              <Link to="/customer/reviews">Đánh giá của tôi</Link>
              <Link to="/customer/profile">Hồ sơ</Link>
            </>
          ) : isAuthenticated ? (
            <>
              <Link to={isHotelAdmin ? "/hotel-admin" : "/admin"}>Khu vực quản trị</Link>
              {isHotelAdmin ? <Link to="/hotel-admin/profile">Hồ sơ</Link> : null}
            </>
          ) : (
            <>
              <Link to="/login">Đăng nhập</Link>
              <Link to="/register">Đăng ký</Link>
              <Link to="/login">Đăng nhập để xem đơn đặt phòng</Link>
              <Link to="/login">Đăng nhập để lưu yêu thích</Link>
            </>
          )}
        </div>
      </div>

      <div className="container home-footer-pro-bottom">
        <span>© 2026 EnziuRooms. All rights reserved.</span>

        <span className="home-footer-pro-secure">
          <ShieldCheck size={15} />
          Thanh toán an toàn
          <b>PayOS</b>
          <b>VietQR</b>
          <b>Ví Enziu</b>
        </span>

        <span className="home-footer-pro-locale">
          <Headphones size={14} /> Hỗ trợ trực tuyến
          <i />
          <Globe2 size={14} /> Tiếng Việt · VND
        </span>
      </div>
    </footer>
  );
}
