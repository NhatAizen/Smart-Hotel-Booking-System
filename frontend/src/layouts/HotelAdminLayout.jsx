import { Outlet } from "react-router-dom";

import SkipLink from "../components/common/SkipLink";
import HotelAdminNavbar from "../components/layout/HotelAdminNavbar";
import "../styles/HotelAdminExperience.css";

export default function HotelAdminLayout() {
  return (
    <div className="admin-shell hotel-admin-shell hotel-admin-experience">
      <SkipLink />
      <HotelAdminNavbar />

      <main id="main-content" className="admin-main hotel-admin-main" tabIndex={-1}>
        <div className="admin-content hotel-admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
