import {
  AlertTriangle,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import EnziuPageLoader from "../../components/common/EnziuPageLoader";

const oauthExchangeRequests = new Map();

function exchangeOAuthCodeOnce(
  code,
  exchangeFunction,
) {
  if (!oauthExchangeRequests.has(code)) {
    const request = exchangeFunction(code).catch(
      (error) => {
        oauthExchangeRequests.delete(code);
        throw error;
      },
    );

    oauthExchangeRequests.set(
      code,
      request,
    );
  }

  return oauthExchangeRequests.get(code);
}

function getDestination(role) {
  /*
   * Admin hệ thống vẫn vào dashboard admin.
   */
  if (role === "SYSTEM_ADMIN") {
    return "/admin";
  }

  /*
   * Quản trị khách sạn vẫn vào dashboard khách sạn.
   */
  if (role === "HOTEL_ADMIN") {
    return "/hotel-admin";
  }

  /*
   * Chỉ CUSTOMER quay về trang chủ công khai.
   * Navbar sẽ tự hiển thị thông tin khách hàng.
   */
  return "/";
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message
    ?? error?.message
    ?? "Không thể hoàn tất đăng nhập mạng xã hội."
  );
}

export default function OAuth2CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    loginWithOAuth2Code,
  } = useAuth();

  const code =
    searchParams.get("code")?.trim()
    ?? "";

  const oauthError =
    searchParams.get("error")?.trim()
    ?? "";

  const [state, setState] = useState({
    status: "loading",
    message:
      "Đang hoàn tất đăng nhập mạng xã hội...",
  });

  useEffect(() => {
    if (oauthError) {
      setState({
        status: "error",
        message:
          "Không thể xác thực tài khoản. "
          + "Vui lòng thử lại.",
      });

      return undefined;
    }

    if (!code) {
      setState({
        status: "error",
        message:
          "Không tìm thấy mã đăng nhập.",
      });

      return undefined;
    }

    let active = true;

    setState({
      status: "loading",
      message:
        "Đang hoàn tất đăng nhập mạng xã hội...",
    });

    exchangeOAuthCodeOnce(
      code,
      loginWithOAuth2Code,
    )
      .then((currentUser) => {
        if (!active) {
          return;
        }

        setState({
          status: "success",
          message: "Đang mở EnziuRooms...",
        });

        navigate(
          getDestination(currentUser?.role),
          { replace: true },
        );
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          message: getErrorMessage(error),
        });
      });

    return () => {
      active = false;

    };
  }, [
    code,
    oauthError,
    loginWithOAuth2Code,
    navigate,
  ]);

  if (state.status !== "error") {
    return (
      <EnziuPageLoader
        label={state.message || "Đang hoàn tất đăng nhập..."}
      />
    );
  }

  return (
    <main className="verify-email-page">
      <section className="verify-email-card">
        <Link
          to="/"
          className="verify-email-brand"
        >
          <strong>EnziuRooms</strong>
        </Link>

        <div
          className="verify-email-icon error"
          aria-hidden="true"
        >
          <AlertTriangle size={46} />
        </div>

        <span className="verify-email-eyebrow error">
          ĐĂNG NHẬP THẤT BẠI
        </span>

        <h1>Không thể đăng nhập</h1>
        <p>{state.message}</p>

        <Link
          to="/login"
          className="verify-primary-action"
        >
          Quay lại đăng nhập
        </Link>
      </section>
    </main>
  );
}
