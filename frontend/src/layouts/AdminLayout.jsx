import { Outlet } from "react-router-dom";

import SkipLink from "../components/common/SkipLink";
import SystemAdminNavbar from "../components/layout/SystemAdminNavbar";

export default function AdminLayout() {
  return (
    <div className="admin-shell system-admin-shell">
      <SkipLink />
      <SystemAdminNavbar />

      <main id="main-content" className="admin-main" tabIndex={-1}>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
