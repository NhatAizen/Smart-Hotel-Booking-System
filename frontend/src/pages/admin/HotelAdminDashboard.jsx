import { useAuth } from "../../auth/AuthContext";

export default function HotelAdminDashboard() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Hotel Admin Dashboard</h1>

      <p>
        Xin chào {user?.fullName}.
      </p>

      <p>Role: {user?.role}</p>
    </main>
  );
}