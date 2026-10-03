// A hotel approval is not a financial confirmation. Never coerce an unknown amount to zero.
export function roomChangeFinancialResult(request, formatMoney) {
  const status = request.financialReconciliationStatus;
  const due = request.additionalPaymentDue;
  if (status === "PENDING") return {
    description: "Khách sạn đã duyệt đổi phòng. Hệ thống đang đối soát phần thanh toán và số tiền chênh lệch.",
    dueLabel: "Đang đối soát", dueText: "Chưa xác định", resolved: false,
  };
  if (status === "RECONCILIATION_REQUIRED") return {
    description: "Thay đổi phòng đã được ghi nhận nhưng phần tài chính cần được đối soát trước khi tiếp tục. Vui lòng liên hệ hỗ trợ.",
    dueLabel: "Cần đối soát thủ công", dueText: "Chưa xác định", resolved: false,
  };
  const resolved = (status === "CONFIRMED" || status === "NOT_REQUIRED")
    && due != null && Number.isFinite(Number(due)) && Number(due) >= 0;
  if (resolved) return {
    description: Number(due) > 0
      ? `Đơn đặt phòng đã chuyển sang phòng bạn chọn. Bạn cần thanh toán thêm ${formatMoney(due)} theo phương thức thanh toán hiện tại.`
      : status === "CONFIRMED"
        ? "Đơn đặt phòng đã được cập nhật sang phòng bạn chọn và không phát sinh khoản thanh toán thêm."
        : "Đơn đặt phòng đã chuyển sang phòng bạn chọn. Vui lòng xem phần thanh toán của đơn theo phương thức hiện tại.",
    dueLabel: "Cần thanh toán thêm", dueText: formatMoney(due), resolved: true,
  };
  return {
    description: "Khách sạn đã duyệt đổi phòng. Kết quả tài chính của yêu cầu cũ chưa được xác nhận; vui lòng xem đơn hoặc liên hệ hỗ trợ.",
    dueLabel: "Chưa xác nhận", dueText: "Chưa xác định", resolved: false,
  };
}
