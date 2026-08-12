import { Outlet } from "react-router-dom";

import HotelAdminNavbar from "../components/layout/HotelAdminNavbar";

export default function HotelAdminLayout() {
  return (
    <div className="admin-shell hotel-admin-shell">
      <HotelAdminNavbar />

      <main className="admin-main">
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
