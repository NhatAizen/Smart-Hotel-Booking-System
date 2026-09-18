import { CreditCard, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  StatusBadge,
} from "../../components/ui";
import { getMyPayments } from "../../services/paymentService";
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";
import "./CustomerAccountExperience.css";

const PAGE_SIZE = 8;

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫` : "—";
}

function methodLabel(method) {
  return (
    {
      PAYOS: "PayOS / VietQR",
      WALLET: "Ví Enziu",
      CASH: "Tiền mặt tại khách sạn",
    }[normalizeEnum(method)] ?? "Chưa xác định"
  );
}

function typeLabel(type) {
  return (
    {
      DEPOSIT: "Đặt cọc",
      FULL_PAYMENT: "Thanh toán toàn bộ",
      REMAINING_PAYMENT: "Thanh toán phần còn lại",
    }[normalizeEnum(type)] ?? "Chưa xác định"
  );
}

function paymentStatusLabel(status) {
  return STATUS_LABELS[normalizeEnum(status)] ?? "Chưa xác định";
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const loadPayments = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setError("Không xác định được tài khoản để tải lịch sử thanh toán.");
      return;
    }
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
  }, [user]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadPayments, { debounceMs: 120 });

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const visiblePayments = useMemo(
    () => payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, payments],
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  if (loading) return <Loading message="Đang tải thanh toán..." />;

  return (
    <main className="customer-account-page">
      <div className="container">
        <PageHeader
          eyebrow="Thanh toán"
          title="Lịch sử thanh toán"
          description="Theo dõi giao dịch đặt cọc, thanh toán toàn bộ và hoàn tiền."
          icon={<CreditCard size={22} />}
        />

        <ErrorMessage message={error} />

        <Panel
          className="customer-simple-panel customer-payment-panel"
          title="Các giao dịch của bạn"
          description={payments.length ? `${payments.length} giao dịch từ dữ liệu tài khoản` : undefined}
          padding="none"
          footer={(
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              ariaLabel="Phân trang lịch sử thanh toán"
            />
          )}
        >
          {payments.length === 0 ? (
            <EmptyState
              icon={<CreditCard size={28} />}
              title={error ? "Chưa thể hiển thị giao dịch" : "Chưa có giao dịch"}
              description={error
                ? "Dữ liệu thanh toán chưa tải được. Hãy thử lại khi kết nối ổn định."
                : "Giao dịch trực tuyến sẽ xuất hiện sau khi bạn đặt phòng."}
            />
          ) : (
            visiblePayments.map((payment) => (
              <article className="customer-payment-row" key={payment.id}>
                <span className="customer-payment-row__icon" aria-hidden="true">
                  <ReceiptText size={22} />
                </span>
                <div className="customer-payment-row__copy">
                  <strong>{money(payment.amount)}</strong>
                  <span>
                    {typeLabel(payment.paymentType)} · {methodLabel(payment.method)}
                  </span>
                  <small>
                    {payment.transactionCode
                      ? `Mã giao dịch: ${payment.transactionCode}`
                      : "Chưa có mã giao dịch"}
                  </small>
                </div>
                <StatusBadge
                  status={payment.status}
                  label={paymentStatusLabel(payment.status)}
                  aria-label={`Trạng thái: ${paymentStatusLabel(payment.status)}`}
                />
              </article>
            ))
          )}
        </Panel>
      </div>
    </main>
  );
}
