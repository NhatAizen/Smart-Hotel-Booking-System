import { ArrowUpRight, Bot, Globe2, Headphones, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import { EnziuOrbitMark } from "./EnziuSignatureVisuals";
import "./EnziuHomeFooter.css";

export default function EnziuHomeFooter() {
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();
  const role = String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase();
  const isCustomer = isAuthenticated && role === "CUSTOMER";
  const isHotelAdmin = isAuthenticated && role === "HOTEL_ADMIN";
  const privateHome = isHotelAdmin ? "/hotel-admin" : "/admin";

  const aiControl = isCustomer ? (
    <button type="button" className="enziu-footer-ai" onClick={() => openAssistant({ clearHotelContext: true })}><Bot size={17} /> Hỏi Enziu AI <ArrowUpRight size={16} /></button>
  ) : (
    <Link to={isAuthenticated ? privateHome : "/login"} className="enziu-footer-ai"><Bot size={17} /> {isAuthenticated ? "Về khu vực của bạn" : "Đăng nhập để hỏi AI"} <ArrowUpRight size={16} /></Link>
  );

  return (
    <footer className="enziu-footer">
      <div className="enziu-footer-orbit" aria-hidden="true" />
      <div className="enziu-fullbleed-inner enziu-footer-main">
        <div className="enziu-footer-brand">
          <Link to="/" className="enziu-footer-logo" aria-label="EnziuRooms - Trang chủ"><EnziuOrbitMark /><span><strong>Enziu</strong>Rooms</span></Link>
          <h2>Ở đúng nơi.<br />Đi đúng nhịp.</h2>
          <p>Một hành trình lưu trú thông minh, minh bạch và giàu cảm hứng từ lúc tìm kiếm đến sau chuyến đi.</p>
          {aiControl}
        </div>

        <nav className="enziu-footer-nav" aria-label="Liên kết cuối trang">
          <div><h3>Khám phá</h3><Link to="/hotels">Khách sạn</Link><Link to="/hotels">Điểm đến</Link><Link to="/about">Về EnziuRooms</Link>{isCustomer ? <Link to="/customer/rewards">Ưu đãi & hạng</Link> : <Link to="/login">Ưu đãi thành viên</Link>}</div>
          <div><h3>Hỗ trợ</h3><Link to="/help">Trung tâm trợ giúp</Link><a href="/#faq">Câu hỏi thường gặp</a><Link to="/cancellation-policy">Hủy phòng</Link><Link to="/refund-policy">Hoàn tiền</Link></div>
          <div><h3>Đối tác</h3>{isCustomer ? <Link to="/customer/partner">Đăng ký đối tác</Link> : isHotelAdmin ? <Link to="/hotel-admin/hotels">Quản lý khách sạn</Link> : <Link to="/login">Đăng nhập để đăng ký</Link>}<Link to="/terms">Điều khoản</Link><Link to="/privacy">Bảo mật</Link><Link to="/payment-policy">Thanh toán</Link></div>
          <div><h3>Tài khoản</h3>{isCustomer ? <><Link to="/customer/bookings">Đơn đặt phòng</Link><Link to="/customer/favorites">Yêu thích</Link><Link to="/customer/reviews">Đánh giá của tôi</Link><Link to="/customer/profile">Hồ sơ</Link></> : isAuthenticated ? <Link to={privateHome}>Khu vực quản trị</Link> : <><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></>}</div>
        </nav>
      </div>

      <div className="enziu-fullbleed-inner enziu-footer-bottom">
        <span>© {new Date().getFullYear()} EnziuRooms</span>
        <span><ShieldCheck size={15} /> Thanh toán an toàn <b>PayOS</b><b>VietQR</b><b>Ví Enziu</b></span>
        <span><Headphones size={15} /> Hỗ trợ trực tuyến <i /> <Globe2 size={15} /> Tiếng Việt · VND</span>
      </div>
    </footer>
  );
}
