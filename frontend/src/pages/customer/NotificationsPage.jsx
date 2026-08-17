import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";
import "./CustomerAccountExperience.css";

export default function NotificationsPage() {
  return (
    <div className="container notification-customer-wrap">
      <NotificationCenterPage
        eyebrow="TÀI KHOẢN ENZIUROOMS"
        title="Thông báo của tôi"
        description="Theo dõi booking, thanh toán, check-in, checkout và các cập nhật dành cho chuyến đi của bạn."
      />
    </div>
  );
}
