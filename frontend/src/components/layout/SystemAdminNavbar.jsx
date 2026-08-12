import {
  BedDouble,
  Bell,
  Building2,
  ClipboardCheck,
  LayoutDashboard,
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

const desktopNavigation = items.map((item) => ({ type: "link", item }));

export default function SystemAdminNavbar() {
  return (
    <AdminNavbar
      variant="system"
      roleLabel="System Admin"
      roleDescription="Quản trị hệ thống"
      homePath="/admin"
      brandIcon={ShieldCheck}
      items={items}
      desktopNavigation={desktopNavigation}
    />
  );
}
