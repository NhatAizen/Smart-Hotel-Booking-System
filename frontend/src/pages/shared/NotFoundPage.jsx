import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="page">
      <h1>404 - Không tìm thấy trang</h1>

      <Link to="/">
        Quay lại trang chủ
      </Link>
    </main>
  );
}