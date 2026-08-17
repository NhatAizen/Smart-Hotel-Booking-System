import { CreditCard, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { getMyPayments } from "../../services/paymentService";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function methodLabel(method) {
  return (
    {
      PAYOS: "PayOS / VietQR",
      WALLET: "Ví Enziu",
      CASH: "Tiền mặt tại khách sạn",
    }[method] ?? method
  );
}

function typeLabel(type) {
  return (
    {
      DEPOSIT: "Đặt cọc",
      FULL_PAYMENT: "Thanh toán toàn bộ",
      REMAINING_PAYMENT: "Thanh toán phần còn lại",
    }[type] ?? type
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPayments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getMyPayments(user.id);
      setPayments(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          "Chưa thể tải lịch sử thanh toán.",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadPayments, { debounceMs: 120 });

  if (loading) return <Loading message="Đang tải thanh toán..." />;

  return (
    <main className="customer-account-page">
      <div className="container">
        <div className="customer-account-heading">
          <span>THANH TOÁN</span>
          <h1>Lịch sử thanh toán</h1>
          <p>Theo dõi giao dịch đặt cọc, thanh toán toàn bộ và hoàn tiền.</p>
        </div>

        <ErrorMessage message={error} />

        <section className="customer-simple-panel">
          {payments.length === 0 ? (
            <div className="customer-empty-results">
              <CreditCard size={42} />
              <h2>Chưa có giao dịch</h2>
              <p>Giao dịch online sẽ xuất hiện sau khi bạn tạo booking.</p>
            </div>
          ) : (
            payments.map((payment) => (
              <article className="customer-payment-row" key={payment.id}>
                <ReceiptText size={22} />
                <div>
                  <strong>{money(payment.amount)}</strong>
                  <span>
                    {typeLabel(payment.paymentType)} · {methodLabel(payment.method)}
                  </span>
                  <small>
                    {payment.transactionCode
                      ? `Mã giao dịch: ${payment.transactionCode}`
                      : `Payment ID: ${payment.id}`}
                  </small>
                </div>
                <span
                  className={`admin-status-badge ${
                    payment.status === "PAID"
                      ? "approved"
                      : payment.status === "FAILED"
                        ? "rejected"
                        : "pending"
                  }`}
                >
                  {payment.status}
                </span>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
