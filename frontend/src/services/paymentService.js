import apiClient from "../api/apiClient";

export async function createPayOsCheckout(bookingIds) {
  const response = await apiClient.post("/payments/payos/checkout", { bookingIds });
  return response.data;
}

export async function createWalletCheckout(bookingIds) {
  const response = await apiClient.post("/payments/wallet/checkout", { bookingIds });
  return response.data;
}

export async function collectCashAtHotel(bookingId) {
  const response = await apiClient.post(`/payments/cash-at-hotel/${bookingId}`);
  return response.data;
}

export async function refundPaymentToWallet(paymentId) {
  const response = await apiClient.patch(`/payments/${paymentId}/refund`);
  return response.data;
}

export async function getPayOsOrder(orderCode) {
  const response = await apiClient.get(`/payments/payos/orders/${orderCode}`);
  return response.data;
}

export async function syncPayOsOrder(orderCode) {
  const response = await apiClient.post(`/payments/payos/orders/${orderCode}/sync`);
  return response.data;
}

export async function cancelPayOsOrder(orderCode) {
  const response = await apiClient.post(`/payments/payos/orders/${orderCode}/cancel`);
  return response.data;
}

export async function getMyPayOsOrders() {
  const response = await apiClient.get("/payments/payos/orders/me");
  return response.data;
}

export async function getPayment(paymentId) {
  const response = await apiClient.get(`/payments/${paymentId}`);
  return response.data;
}

export async function getPaymentsByStatus(status) {
  const response = await apiClient.get("/payments", { params: { status } });
  return response.data;
}

export async function getBookingPayments(bookingId) {
  const response = await apiClient.get(`/bookings/${bookingId}/payments`);
  return response.data;
}

export async function getMyPayments(customerId) {
  if (!customerId) return [];

  const response = await apiClient.get(`/customers/${customerId}/payments`);
  return response.data;
}

export async function createWalletTopUp(amount) {
  const response = await apiClient.post("/wallets/top-up/payos", { amount });
  return response.data;
}

export async function getMyWallet() {
  const response = await apiClient.get("/wallets/me");
  return response.data;
}

export async function getMyWalletTransactions() {
  const response = await apiClient.get("/wallets/me/transactions");
  return response.data;
}

export async function createWithdrawal(payload) {
  const response = await apiClient.post("/withdrawals", payload);
  return response.data;
}

/**
 * Hotel Admin tạo yêu cầu rút tiền.
 *
 * formData có thể chứa:
 * - amount
 * - bankName
 * - bankBin
 * - accountNumber
 * - accountName
 * - receiverQr (nếu Hotel Admin chọn gửi QR cá nhân)
 */
export async function createHotelWithdrawal(formData) {
  const response = await apiClient.post("/withdrawals/hotel", formData);
  return response.data;
}

/**
 * Lấy QR nhận tiền mà Hotel Admin đã gửi.
 * Backend trả về file ảnh nên phải dùng responseType = blob.
 */
export async function getWithdrawalReceiverQr(id) {
  const response = await apiClient.get(`/withdrawals/${id}/receiver-qr`, {
    responseType: "blob",
  });

  return response.data;
}

/**
 * Lấy ảnh/chứng từ chuyển khoản do System Admin tải lên
 * sau khi đã chuyển tiền thật cho Hotel Admin.
 */
export async function getWithdrawalTransferProof(id) {
  const response = await apiClient.get(`/withdrawals/${id}/transfer-proof`, {
    responseType: "blob",
  });

  return response.data;
}

/**
 * Danh sách yêu cầu rút tiền của Hotel Admin hiện tại.
 */
export async function getMyWithdrawals() {
  const response = await apiClient.get("/withdrawals/me");
  return response.data;
}

/**
 * Ví của System Admin.
 */
export async function getPlatformWallet() {
  const response = await apiClient.get("/admin/wallet");
  return response.data;
}

/**
 * Lịch sử giao dịch ví System Admin.
 */
export async function getPlatformWalletTransactions() {
  const response = await apiClient.get("/admin/wallet/transactions");
  return response.data;
}

/**
 * System Admin lấy danh sách yêu cầu rút tiền.
 *
 * Ví dụ:
 * getWithdrawals()
 * getWithdrawals("PENDING")
 * getWithdrawals("APPROVED")
 * getWithdrawals("PAID")
 */
export async function getWithdrawals(status = "") {
  const response = await apiClient.get("/admin/withdrawals", {
    params: status ? { status } : undefined,
  });

  return response.data;
}

/**
 * System Admin duyệt yêu cầu rút tiền.
 *
 * executePayout = false:
 * chỉ duyệt yêu cầu, admin tự chuyển khoản thật.
 *
 * executePayout = true:
 * dùng khi backend có hỗ trợ payout tự động.
 */
export async function approveWithdrawal(
  id,
  note = "",
  executePayout = false,
) {
  const response = await apiClient.post(
    `/admin/withdrawals/${id}/approve`,
    { note },
    {
      params: {
        executePayout,
      },
    },
  );

  return response.data;
}

/**
 * System Admin từ chối yêu cầu rút tiền.
 */
export async function rejectWithdrawal(id, note = "") {
  const response = await apiClient.post(
    `/admin/withdrawals/${id}/reject`,
    { note },
  );

  return response.data;
}

/**
 * Sau khi System Admin chuyển khoản THẬT,
 * admin nhập mã giao dịch và upload ảnh biên lai.
 */
export async function markWithdrawalPaid(
  id,
  transferReference,
  transferProof,
) {
  const formData = new FormData();

  formData.append("transferReference", transferReference);
  formData.append("transferProof", transferProof);

  const response = await apiClient.post(
    `/admin/withdrawals/${id}/mark-paid`,
    formData,
  );

  return response.data;
}

/**
 * System Admin giải ngân doanh thu khách sạn.
 */
export async function releaseHotelRevenue(paymentId) {
  const response = await apiClient.post(
    `/admin/payments/${paymentId}/release-revenue`,
  );

  return response.data;
}

/**
 * Thanh toán phần tiền còn lại khi check-in bằng PayOS.
 */
export async function createCheckInPayOsCheckout(bookingId) {
  const response = await apiClient.post(
    `/payments/payos/check-in/${bookingId}`,
  );

  return response.data;
}