import { useAuth } from "../../auth/AuthContext";

export default function HotelAdminDashboard() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Tổng quan khách sạn</h1>

      <p>
        Xin chào {user?.fullName}.
      </p>

      
    </main>
  );
}