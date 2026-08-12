import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Hotel,
  LoaderCircle,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  resendVerificationRequest,
  verifyEmailRequest,
} from "../../services/authService";

const initialState = {
  status: "loading",
  message: "Đang kiểm tra liên kết xác thực...",
};

const verificationRequests = new Map();

function verifyEmailOnce(token) {
  if (!verificationRequests.has(token)) {
    const request = verifyEmailRequest(token).catch((error) => {
      verificationRequests.delete(token);
      throw error;
    });

    verificationRequests.set(token, request);
  }

  return verificationRequests.get(token);
}

function getApiError(error) {
  const data = error?.response?.data;
  return {
    code: data?.code ?? "",
    message:
      data?.message ??
      "Liên kết xác thực không hợp lệ hoặc đã hết hạn.",
  };
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";

  const [result, setResult] = useState(initialState);
  const [email, setEmail] = useState(emailFromUrl);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setResult({
        status: "error",
        code: "MISSING_TOKEN",
        message: "Liên kết xác thực không chứa token.",
      });
      return undefined;
    }

    let cancelled = false;

    verifyEmailOnce(token)
      .then((response) => {
        if (cancelled) return;
        setResult({
          status: "success",
          code: "VERIFIED",
          message:
            response?.message ??
            "Email của bạn đã được xác thực thành công.",
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const apiError = getApiError(error);
        setResult({
          status: "error",
          code: apiError.code,
          message: apiError.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend(event) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setResendMessage("Vui lòng nhập email đã đăng ký.");
      return;
    }

    setResending(true);
    setResendMessage("");

    try {
      const response = await resendVerificationRequest(normalizedEmail);
      setResendMessage(
        response?.message ??
          "Nếu tài khoản tồn tại, email xác thực mới đã được gửi.",
      );
    } catch (error) {
      setResendMessage(
        error?.response?.data?.message ??
          "Không thể gửi lại email xác thực. Vui lòng thử lại.",
      );
    } finally {
      setResending(false);
    }
  }

  const isLoading = result.status === "loading";
  const isSuccess = result.status === "success";
  const isUsedOrExpired = result.code === "INVALID_ACCOUNT_TOKEN";

  return (
    <main className="verify-email-page">
      <section className="verify-email-card">
        <Link to="/" className="verify-email-brand">
          <span><Hotel size={25} /></span>
          <strong>EnziuRooms</strong>
        </Link>

        <div className={`verify-email-icon ${result.status}`} aria-hidden="true">
          {isLoading ? (
            <LoaderCircle size={43} className="verify-spin" />
          ) : isSuccess ? (
            <CheckCircle2 size={48} />
          ) : (
            <AlertTriangle size={46} />
          )}
        </div>

        {isLoading ? (
          <>
            <span className="verify-email-eyebrow">ĐANG XÁC THỰC</span>
            <h1>Vui lòng chờ một chút</h1>
            <p>{result.message}</p>
          </>
        ) : isSuccess ? (
          <>
            <span className="verify-email-eyebrow success">XÁC THỰC THÀNH CÔNG</span>
            <h1>Email đã được xác thực!</h1>
            <p>{result.message} Tài khoản EnziuRooms của bạn đã sẵn sàng để đăng nhập và đặt phòng.</p>
            <Link to="/login" className="verify-primary-action">Đăng nhập ngay <ArrowRight size={18} /></Link>
            <Link to="/hotels" className="verify-secondary-link">Xem khách sạn</Link>
          </>
        ) : (
          <>
            <span className="verify-email-eyebrow error">
              {isUsedOrExpired ? "LIÊN KẾT KHÔNG CÒN HIỆU LỰC" : "KHÔNG THỂ XÁC THỰC"}
            </span>
            <h1>{isUsedOrExpired ? "Liên kết đã được sử dụng hoặc hết hạn" : "Không thể xác thực email"}</h1>
            <p>{result.message}</p>
            <p className="verify-email-note">
              {isUsedOrExpired
                ? "Tài khoản có thể đã được xác thực trước đó. Hãy thử đăng nhập; nếu chưa được, hãy yêu cầu liên kết mới."
                : "Vui lòng kiểm tra lại liên kết hoặc yêu cầu gửi lại email xác thực."}
            </p>
            <Link to="/login" className="verify-primary-action">Thử đăng nhập <ArrowRight size={18} /></Link>
            <div className="verify-divider"><span>hoặc gửi lại liên kết</span></div>
            <form className="verify-resend-form" onSubmit={handleResend}>
              <label htmlFor="verify-email-address">Email đã đăng ký</label>
              <div>
                <MailCheck size={19} />
                <input
                  id="verify-email-address"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setResendMessage("");
                  }}
                  placeholder="name@gmail.com"
                  autoComplete="email"
                />
              </div>
              <button type="submit" disabled={resending}>
                {resending ? <LoaderCircle size={18} className="verify-spin" /> : <RefreshCw size={18} />}
                {resending ? "Đang gửi..." : "Gửi lại email xác thực"}
              </button>
            </form>
            {resendMessage ? <div className="verify-resend-message">{resendMessage}</div> : null}
          </>
        )}

        <footer className="verify-email-footer">© EnziuRooms · Đặt phòng khách sạn thông minh</footer>
      </section>
    </main>
  );
}
