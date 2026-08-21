import { Outlet } from "react-router-dom";

import SkipLink from "../components/common/SkipLink";
import Navbar from "../components/layout/Navbar";

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <SkipLink />
      <Navbar />

      <div id="main-content" className="route-content" tabIndex={-1}>
        <Outlet />
      </div>
    </div>
  );
}
