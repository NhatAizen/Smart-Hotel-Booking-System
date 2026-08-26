import {
  BedDouble,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Gift,
  LayoutDashboard,
  ShieldCheck,
  Star,
  Users,
  WalletCards,
} from "lucide-react";

import enziuLogo from "../../assets/enziu-logo.png";
import AdminNavbar from "./AdminNavbar";

const items = [
  {
    to: "/admin",
    label: "Tổng quan",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/admin/users",
    label: "Tài khoản",
    icon: Users,
  },
  {
    to: "/admin/bookings",
    label: "Booking hệ thống",
    icon: ClipboardList,
  },
  {
    to: "/admin/partner-requests",
    label: "Yêu cầu đối tác",
    icon: ClipboardCheck,
  },
  {
    to: "/admin/hotels",
    label: "Duyệt khách sạn",
    icon: Building2,
  },
  {
    to: "/admin/room-types",
    label: "Duyệt loại phòng",
    icon: BedDouble,
  },
  {
    to: "/admin/reviews",
    label: "Đánh giá",
    icon: Star,
  },
  {
    to: "/admin/marketing",
    label: "Ưu đãi nền tảng",
    icon: Gift,
  },
  {
    to: "/admin/wallet",
    label: "Ví & đối soát",
    icon: WalletCards,
  },
  {
    to: "/admin/notifications",
    label: "Thông báo",
    icon: Bell,
  },
];

const desktopNavigation = [
  { type: "link", item: items[0] },
  { type: "link", item: items[1] },
  { type: "link", item: items[2] },
  {
    type: "group",
    label: "Kiểm duyệt",
    icon: ShieldCheck,
    items: [items[3], items[4], items[5], items[6]],
  },
  {
    type: "group",
    label: "Kinh doanh",
    icon: WalletCards,
    items: [items[7], items[8]],
  },
  { type: "link", item: items[9] },
];

export default function SystemAdminNavbar() {
  return (
    <AdminNavbar
      variant="system"
      roleLabel="Quản trị"
      roleDescription="Điều hành nền tảng EnziuRooms"
      homePath="/admin"
      brandImageUrl={enziuLogo}
      brandImageAlt="Logo EnziuRooms"
      brandImageFit="contain"
      items={items}
      desktopNavigation={desktopNavigation}
    />
  );
}
