import {
  AlertTriangle,
  CheckCircle2,
  Hotel,
  LoaderCircle,
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
    let redirectTimer;

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
          message:
            "Đăng nhập thành công.",
        });

        redirectTimer = window.setTimeout(
          () => {
            navigate(
              getDestination(
                currentUser?.role,
              ),
              {
                replace: true,
              },
            );
          },
          700,
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

      if (redirectTimer) {
        window.clearTimeout(
          redirectTimer,
        );
      }
    };
  }, [
    code,
    oauthError,
    loginWithOAuth2Code,
    navigate,
  ]);

  const isLoading =
    state.status === "loading";

  const isSuccess =
    state.status === "success";

  return (
    <main className="verify-email-page">
      <section className="verify-email-card">
        <Link
          to="/"
          className="verify-email-brand"
        >
          <span>
            <Hotel size={25} />
          </span>

          <strong>EnziuRooms</strong>
        </Link>

        <div
          className={
            `verify-email-icon ${state.status}`
          }
          aria-hidden="true"
        >
          {isLoading ? (
            <LoaderCircle
              size={43}
              className="verify-spin"
            />
          ) : isSuccess ? (
            <CheckCircle2 size={48} />
          ) : (
            <AlertTriangle size={46} />
          )}
        </div>

        <span
          className={
            `verify-email-eyebrow ${
              isSuccess
                ? "success"
                : state.status === "error"
                  ? "error"
                  : ""
            }`
          }
        >
          {isLoading
            ? "ĐANG ĐĂNG NHẬP"
            : isSuccess
              ? "ĐĂNG NHẬP THÀNH CÔNG"
              : "ĐĂNG NHẬP THẤT BẠI"}
        </span>

        <h1>
          {isLoading
            ? "Vui lòng chờ một chút"
            : isSuccess
              ? "Chào mừng đến EnziuRooms!"
              : "Không thể đăng nhập"}
        </h1>

        <p>{state.message}</p>

        {!isLoading && !isSuccess ? (
          <Link
            to="/login"
            className="verify-primary-action"
          >
            Quay lại đăng nhập
          </Link>
        ) : null}

        <footer className="verify-email-footer">
          © EnziuRooms · Đặt phòng khách sạn
          thông minh
        </footer>
      </section>
    </main>
  );
}