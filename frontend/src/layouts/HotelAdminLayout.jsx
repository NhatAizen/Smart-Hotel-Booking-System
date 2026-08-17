import { Outlet } from "react-router-dom";

import HotelAdminNavbar from "../components/layout/HotelAdminNavbar";
import "../styles/HotelAdminExperience.css";

export default function HotelAdminLayout() {
  return (
    <div className="admin-shell hotel-admin-shell hotel-admin-experience">
      <HotelAdminNavbar />

      <main className="admin-main hotel-admin-main">
        <div className="admin-content hotel-admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
