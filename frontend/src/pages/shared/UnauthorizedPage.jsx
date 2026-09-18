import { ArrowLeft, LogIn, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import "../../styles/components/states.css";

export default function UnauthorizedPage() {
  return (
    <main className="system-state-page">
      <section className="system-state-card" aria-labelledby="forbidden-title">
        <div className="system-state-icon is-warning" aria-hidden="true"><ShieldAlert /></div>
        <p className="system-state-code">403</p>
        <h1 id="forbidden-title">Bạn chưa thể truy cập trang này</h1>
        <p>Hãy đăng nhập bằng tài khoản có quyền phù hợp hoặc quay lại khu vực công khai.</p>
        <div className="system-state-actions">
          <Link className="btn btn-primary" to="/login"><LogIn size={17} /> Đăng nhập</Link>
          <Link className="btn btn-secondary" to="/"><ArrowLeft size={17} /> Trang chủ</Link>
        </div>
      </section>
    </main>
  );
}
