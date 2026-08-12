import { ShieldCheck } from "lucide-react";
import { Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import Sidebar from "../components/layout/Sidebar";
import NotificationBell from "../components/notifications/NotificationBell";

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="admin-shell">
      <Sidebar />

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar-kicker">
              <ShieldCheck size={16} /> Trung tâm quản trị
            </span>
            <strong>Chào {user?.fullName ?? "quản trị viên"}</strong>
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
