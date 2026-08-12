import {
  BedDouble,
  Bell,
  Building2,
  DoorOpen,
  Hotel,
  LayoutDashboard,
  PlusCircle,
  ScanLine,
  Tags,
  UserRound,
  WalletCards,
} from "lucide-react";

import AdminNavbar from "./AdminNavbar";

const items = [
  {
    to: "/hotel-admin",
    label: "Tổng quan",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/hotel-admin/hotels",
    label: "Khách sạn của tôi",
    icon: Building2,
    end: true,
  },
  {
    to: "/hotel-admin/hotels/create",
    label: "Đăng ký khách sạn",
    icon: PlusCircle,
  },
  {
    to: "/hotel-admin/room-types",
    label: "Loại phòng",
    icon: Tags,
  },
  {
    to: "/hotel-admin/rooms",
    label: "Quản lý phòng",
    icon: BedDouble,
  },
  {
    to: "/hotel-admin/check-in",
    label: "Nhận phòng QR",
    icon: ScanLine,
  },
  {
    to: "/hotel-admin/current-stays",
    label: "Khách đang lưu trú",
    icon: DoorOpen,
  },
  {
    to: "/hotel-admin/profile",
    label: "Hồ sơ cá nhân",
    icon: UserRound,
  },
  {
    to: "/hotel-admin/wallet",
    label: "Ví & rút tiền",
    icon: WalletCards,
  },
  {
    to: "/hotel-admin/notifications",
    label: "Thông báo",
    icon: Bell,
  },
];

const desktopNavigation = [
  { type: "link", item: items[0] },
  {
    type: "group",
    label: "Khách sạn",
    icon: Building2,
    items: [items[1], items[2]],
  },
  { type: "link", item: items[3] },
  { type: "link", item: items[4] },
  {
    type: "group",
    label: "Vận hành",
    icon: ScanLine,
    items: [items[5], items[6]],
  },
  { type: "link", item: items[8] },
  { type: "link", item: items[9] },
];

export default function HotelAdminNavbar() {
  return (
    <AdminNavbar
      variant="hotel"
      roleLabel="Hotel Admin"
      roleDescription="Quản lý đối tác"
      homePath="/hotel-admin"
      brandIcon={Hotel}
      items={items}
      desktopNavigation={desktopNavigation}
      profilePath="/hotel-admin/profile"
    />
  );
}
