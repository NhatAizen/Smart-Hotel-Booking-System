import {
  BedDouble,
  Bell,
  Building2,
  ClipboardCheck,
  Gift,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

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
    label: "Quản lý tài khoản",
    icon: Users,
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
  {
    type: "group",
    label: "Kiểm duyệt",
    icon: ShieldCheck,
    items: [items[2], items[3], items[4]],
  },
  {
    type: "group",
    label: "Kinh doanh",
    icon: WalletCards,
    items: [items[5], items[6]],
  },
  { type: "link", item: items[7] },
];

export default function SystemAdminNavbar() {
  return (
    <AdminNavbar
      variant="system"
      roleLabel="Quản trị"
      roleDescription="Quản lý EnziuRooms"
      homePath="/admin"
      brandIcon={Settings2}
      items={items}
      desktopNavigation={desktopNavigation}
    />
  );
}
