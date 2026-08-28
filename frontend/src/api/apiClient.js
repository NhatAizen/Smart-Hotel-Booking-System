import axios from "axios";

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:8080/api",
  timeout: 30000,
});

const PUBLIC_AUTH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/oauth2/exchange",
];

function isPublicAuthRequest(config) {
  const url = String(config?.url ?? "").split("?")[0];
  return PUBLIC_AUTH_PATHS.some((path) => url === path || url.endsWith(path));
}

function isAuthScreen() {
  const pathname = window.location.pathname;
  return pathname === "/login"
    || pathname === "/login/enziurooms"
    || pathname === "/register"
    || pathname === "/forgot-password"
    || pathname === "/reset-password";
}

function isPublicScreen() {
  const pathname = window.location.pathname;

  return pathname === "/"
    || pathname === "/hotels"
    || pathname.startsWith("/hotels/")
    || pathname === "/about"
    || pathname === "/help"
    || pathname === "/terms"
    || pathname === "/privacy"
    || pathname === "/cancellation-policy"
    || pathname === "/refund-policy"
    || pathname === "/payment-policy"
    || pathname === "/oauth2/callback"
    || pathname === "/unauthorized";
}

apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");

    // Các endpoint đăng nhập/đăng ký phải hoạt động độc lập với token cũ.
    // Nếu token cũ đã hết hạn mà vẫn đính kèm vào request login, một số gateway
    // có thể trả 401 trước khi Identity Service xử lý username/password.
    if (accessToken && !isPublicAuthRequest(config)) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }

    // Nếu là FormData thì để browser tự thêm multipart/form-data.
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    } else {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const failedLoginOrPublicAuth = isPublicAuthRequest(error.config);
      const hadAccessToken = Boolean(localStorage.getItem("accessToken"));

      // Guest được phép ở lại các trang PUBLIC kể cả khi một API phụ trả 401.
      // Trước đây mọi 401 đều window.location.replace("/login"), nên homepage
      // có thể bị đá sang màn hình chọn phương thức đăng nhập dù route "/" là public.
      if (hadAccessToken && !failedLoginOrPublicAuth) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
      }

      // Chỉ ép về login khi người dùng đang ở route cần đăng nhập và trước đó
      // thực sự có session/token. Guest trên /, /hotels và các trang chính sách
      // phải tiếp tục xem web bình thường.
      if (
        hadAccessToken
        && !failedLoginOrPublicAuth
        && !isAuthScreen()
        && !isPublicScreen()
      ) {
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
