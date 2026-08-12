import { Outlet } from "react-router-dom";

import Navbar from "../components/layout/Navbar";

export default function CustomerLayout() {
  return (
    <div className="customer-layout">
      <Navbar />
      <Outlet />
    </div>
  );
}
