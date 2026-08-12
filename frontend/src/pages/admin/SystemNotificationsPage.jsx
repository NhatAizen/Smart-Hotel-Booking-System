import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";

export default function SystemNotificationsPage() {
  return (
    <NotificationCenterPage
      admin
      eyebrow="SYSTEM ADMIN"
      title="Trung tâm thông báo hệ thống"
      description="Theo dõi yêu cầu đối tác, khách sạn chờ duyệt, rút tiền và các sự kiện cần System Admin xử lý."
    />
  );
}
