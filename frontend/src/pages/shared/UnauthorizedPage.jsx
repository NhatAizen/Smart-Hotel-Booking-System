import { Link } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <main className="page">
      <h1>403 - Không có quyền truy cập</h1>

      <Link to="/">
        Quay lại trang chủ
      </Link>
    </main>
  );
}