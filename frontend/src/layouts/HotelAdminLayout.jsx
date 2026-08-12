import { Hotel } from "lucide-react";
import { Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import HotelAdminSidebar from "../components/layout/HotelAdminSidebar";
import NotificationBell from "../components/notifications/NotificationBell";

export default function HotelAdminLayout() {
  const { user } = useAuth();

  return (
    <div className="admin-shell hotel-admin-shell">
      <HotelAdminSidebar />

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar-kicker hotel-admin-kicker">
              <Hotel size={16} />
              Trung tâm đối tác
            </span>
            <strong>
              Chào {user?.fullName ?? "đối tác khách sạn"}
            </strong>
          </div>

          <NotificationBell admin />
        </header>

        <div className="admin-content">
          <Outlet />
        </div>
      </section>
    </div>
  );
}
