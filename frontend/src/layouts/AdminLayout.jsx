import { Outlet } from "react-router-dom";

import SystemAdminNavbar from "../components/layout/SystemAdminNavbar";

export default function AdminLayout() {
  return (
    <div className="admin-shell system-admin-shell">
      <SystemAdminNavbar />

      <main className="admin-main">
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
