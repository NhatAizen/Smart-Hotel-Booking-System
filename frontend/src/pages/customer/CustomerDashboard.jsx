import {
  BedDouble,
  Bell,
  Bot,
  CalendarCheck2,
  Hotel,
  Handshake,
  Search,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useAiAssistant } from "../../ai/AiAssistantContext";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { openAssistant } = useAiAssistant();

  return (
    <main className="customer-dashboard-page">
      <div className="container">
        <section className="customer-dashboard-welcome">
          <div>
            <span>ENZIUROOMS CUSTOMER</span>
            <h1>Xin chào, {user?.fullName ?? "bạn"}!</h1>
            <p>
              Tìm khách sạn, theo dõi đơn đặt phòng và nhận hỗ trợ
              từ trợ lý AI tại một nơi.
            </p>
          </div>

          <Link to="/hotels" className="primary-button">
            <Search size={18} />
            Tìm khách sạn
          </Link>
        </section>

        <section className="customer-dashboard-grid">
          <Link to="/hotels" className="customer-dashboard-card">
            <Hotel size={25} />
            <strong>Khám phá khách sạn</strong>
            <span>Xem khách sạn và phòng đã được duyệt</span>
          </Link>

          <Link
            to="/customer/bookings"
            className="customer-dashboard-card"
          >
            <CalendarCheck2 size={25} />
            <strong>Đơn đặt phòng</strong>
            <span>Theo dõi lịch sử và trạng thái booking</span>
          </Link>

          <Link
            to="/customer/payments"
            className="customer-dashboard-card"
          >
            <BedDouble size={25} />
            <strong>Thanh toán</strong>
            <span>Kiểm tra các giao dịch đặt phòng</span>
          </Link>

          <Link
            to="/customer/notifications"
            className="customer-dashboard-card"
          >
            <Bell size={25} />
            <strong>Thông báo</strong>
            <span>Nhận cập nhật về booking và thanh toán</span>
          </Link>

          <Link
            to="/customer/wallet"
            className="customer-dashboard-card"
          >
            <WalletCards size={25} />
            <strong>Ví Enziu</strong>
            <span>Nhận hoàn tiền, thanh toán booking và rút về ngân hàng</span>
          </Link>


          <Link
            to="/customer/partner"
            className="customer-dashboard-card"
          >
            <Handshake size={25} />
            <strong>Đăng ký làm đối tác</strong>
            <span>Đăng ký Hotel Admin và đưa khách sạn lên EnziuRooms</span>
          </Link>

          <button
            type="button"
            className="customer-dashboard-card ai-dashboard-trigger"
            onClick={() => openAssistant({ clearHotelContext: true, openTrip: true })}
          >
            <Bot size={25} />
            <strong>Trợ lý AI</strong>
            <span>Nhận gợi ý khách sạn theo nhu cầu</span>
          </button>
        </section>
      </div>
    </main>
  );
}
