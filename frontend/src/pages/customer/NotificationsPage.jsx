import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";
import "./CustomerAccountExperience.css";

export default function NotificationsPage() {
  return (
    <div className="container notification-customer-wrap">
      <NotificationCenterPage
        eyebrow="TÀI KHOẢN ENZIUROOMS"
        title="Thông báo của tôi"
        description="Theo dõi đơn đặt phòng, thanh toán, nhận phòng, trả phòng và các cập nhật cho chuyến đi của bạn."
      />
    </div>
  );
}
