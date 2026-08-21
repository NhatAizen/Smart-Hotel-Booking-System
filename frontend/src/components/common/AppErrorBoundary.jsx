import { Component } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Giữ chi tiết kỹ thuật trong DevTools, không hiển thị stack trace cho người dùng.
    console.error("[EnziuRooms] Lỗi giao diện không mong muốn", error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-error-boundary" role="alert">
        <section className="app-error-boundary__card">
          <span className="app-error-boundary__icon" aria-hidden="true">
            <AlertTriangle size={28} />
          </span>

          <div>
            <p className="app-error-boundary__eyebrow">ENZIUROOMS</p>
            <h1>Trang này vừa gặp sự cố</h1>
            <p>
              Dữ liệu và tài khoản của bạn không bị thay đổi. Hãy tải lại trang;
              nếu sự cố vẫn còn, quay về trang chủ và thử lại.
            </p>
          </div>

          <div className="app-error-boundary__actions">
            <button type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={18} aria-hidden="true" />
              Tải lại trang
            </button>

            <a href="/">
              <Home size={18} aria-hidden="true" />
              Về trang chủ
            </a>
          </div>
        </section>
      </main>
    );
  }
}
