import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import "../../styles/components/states.css";

export default function NotFoundPage() {
  return (
    <main className="system-state-page">
      <section className="system-state-card" aria-labelledby="not-found-title">
        <div className="system-state-icon" aria-hidden="true"><Compass /></div>
        <p className="system-state-code">404</p>
        <h1 id="not-found-title">Không tìm thấy trang</h1>
        <p>Địa chỉ có thể đã thay đổi hoặc trang bạn tìm không còn tồn tại.</p>
        <div className="system-state-actions">
          <Link className="btn btn-primary" to="/hotels">Khám phá khách sạn</Link>
          <Link className="btn btn-secondary" to="/"><ArrowLeft size={17} /> Trang chủ</Link>
        </div>
      </section>
    </main>
  );
}
