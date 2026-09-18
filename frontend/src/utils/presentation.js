export const ROLE_LABELS = Object.freeze({
  CUSTOMER: "Khách hàng",
  HOTEL_ADMIN: "Quản lý khách sạn",
  SYSTEM_ADMIN: "Quản trị hệ thống",
});

export const TRANSACTION_TYPE_LABELS = Object.freeze({
  PLATFORM_COMMISSION: "Hoa hồng nền tảng",
  REFUND_DEBIT: "Hoàn tiền",
  REFUND_CREDIT: "Tiền hoàn",
  CUSTOMER_REFUND_CREDIT: "Hoàn tiền",
  CUSTOMER_PAYMENT_DEBIT: "Thanh toán đặt phòng",
  BOOKING_PAYMENT: "Thanh toán đặt phòng",
  BOOKING_REVENUE: "Doanh thu đặt phòng",
  HOTEL_PAYOUT: "Đối soát khách sạn",
  HOTEL_REVENUE_PENDING: "Doanh thu khách sạn đang giữ",
  HOTEL_REVENUE_RELEASED: "Doanh thu đã giải ngân",
  WALLET_TOP_UP: "Nạp tiền vào ví",
  WITHDRAWAL: "Rút tiền",
  WITHDRAWAL_HOLD: "Tạm giữ chờ rút",
  WITHDRAWAL_RELEASED: "Hoàn lại tiền tạm giữ",
  WITHDRAWAL_PAID: "Đã chuyển về ngân hàng",
  CASH_REVENUE_RECORDED: "Doanh thu tiền mặt",
  HOTEL_COMMISSION_DEBIT: "Khấu trừ hoa hồng khách sạn",
  HOTEL_COMMISSION_DEBT_ACCRUED: "Phát sinh công nợ hoa hồng",
  HOTEL_COMMISSION_DEBT_SETTLED: "Đã cấn trừ công nợ hoa hồng",
  MANUAL_ADJUSTMENT: "Điều chỉnh thủ công",
});

export const BED_TYPE_LABELS = Object.freeze({
  SINGLE: "Giường đơn",
  DOUBLE: "Giường đôi",
  QUEEN: "Giường Queen",
  KING: "Giường King",
  TWIN: "Hai giường đơn",
  BUNK: "Giường tầng",
  SOFA_BED: "Giường sofa",
  FUTON: "Đệm Futon",
});

export const REASON_LABELS = Object.freeze({
  PERSONAL_ISSUE: "Sự cố cá nhân",
  CANNOT_ARRIVE: "Không thể đến nhận phòng",
  HOTEL_APPROVED: "Khách sạn đã đồng ý",
  DUPLICATE_BOOKING: "Đặt phòng trùng",
  CHANGE_OF_PLAN: "Thay đổi kế hoạch",
  PAYMENT_ISSUE: "Sự cố thanh toán",
  OTHER: "Lý do khác",
});

export const STATUS_LABELS = Object.freeze({
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
  PENDING: "Chờ xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  PENDING_APPROVAL: "Chờ duyệt",
  PENDING_HOTEL_REVIEW: "Chờ khách sạn duyệt",
  PROCESSING: "Đang xử lý",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã hủy",
  COMPLETED: "Đã hoàn tất",
  PARTIALLY_COMPLETED: "Đã hoàn một phần",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  NO_SHOW: "Không đến",
  AVAILABLE: "Phòng trống",
  OCCUPIED: "Đang có khách",
  CLEANING: "Cần dọn phòng",
  MAINTENANCE: "Đang bảo trì",
  UNPAID: "Chưa thanh toán",
  PARTIALLY_PAID: "Đã thanh toán một phần",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
  EXPIRED: "Đã hết hạn",
  REFUNDED: "Đã hoàn tiền",
  SCHEDULED: "Sắp diễn ra",
  EXHAUSTED: "Đã hết lượt",
  DRAFT: "Bản nháp",
  OPEN: "Đang mở",
  CLOSED: "Đã đóng",
  READ: "Đã đọc",
  UNREAD: "Chưa đọc",
  BLOCKED: "Đã chặn",
  DELETED: "Đã xóa",
  DISABLED: "Đã vô hiệu hóa",
  HELD: "Đang tạm giữ",
  RELEASED: "Đã giải ngân",
  REPLIED: "Đã phản hồi",
  RESOLVED: "Đã giải quyết",
  SUBMITTED: "Đã tiếp nhận",
  UNDER_REVIEW: "Đang xem xét",
  WAITING: "Đang chờ",
  WAITING_FOR_HOTEL: "Chờ khách sạn phản hồi",
  WAITING_FOR_CUSTOMER: "Chờ khách hàng bổ sung",
  RESOLVING: "Đang xử lý",
  VERIFIED: "Đã xác minh",
  VISIBLE: "Đang hiển thị",
  HIDDEN: "Đã ẩn",
  LOCKED: "Đã khóa",
});

export const STATUS_TONES = Object.freeze({
  ACTIVE: "success",
  AVAILABLE: "success",
  APPROVED: "success",
  COMPLETED: "success",
  CONFIRMED: "success",
  PAID: "success",
  CHECKED_IN: "info",
  PROCESSING: "info",
  OPEN: "info",
  PENDING: "warning",
  PENDING_PAYMENT: "warning",
  PENDING_APPROVAL: "warning",
  PENDING_HOTEL_REVIEW: "warning",
  PARTIALLY_PAID: "warning",
  PARTIALLY_COMPLETED: "warning",
  CLEANING: "warning",
  SCHEDULED: "info",
  REJECTED: "danger",
  FAILED: "danger",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  MAINTENANCE: "danger",
  EXPIRED: "neutral",
  EXHAUSTED: "neutral",
  INACTIVE: "neutral",
  CHECKED_OUT: "neutral",
  CLOSED: "neutral",
  REFUNDED: "accent",
  DRAFT: "neutral",
  READ: "neutral",
  UNREAD: "info",
  OCCUPIED: "info",
  UNPAID: "warning",
  BLOCKED: "danger",
  DELETED: "neutral",
  DISABLED: "neutral",
  HELD: "warning",
  RELEASED: "success",
  REPLIED: "info",
  RESOLVED: "success",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  WAITING: "warning",
  WAITING_FOR_HOTEL: "warning",
  WAITING_FOR_CUSTOMER: "warning",
  RESOLVING: "info",
  VERIFIED: "success",
  VISIBLE: "success",
  HIDDEN: "neutral",
  LOCKED: "danger",
});

export function normalizeEnum(value) {
  return String(value ?? "")
    .replace(/^ROLE_/i, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function humanizeEnum(value, labels = {}) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = normalizeEnum(value);
  const mapped = labels[normalized];
  if (mapped) return typeof mapped === "string" ? mapped : mapped.label;

  const readable = normalized.replace(/_/g, " ").toLowerCase();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function overrideFor(value, overrides) {
  if (!overrides) return undefined;
  return overrides[normalizeEnum(value)];
}

export function statusLabel(value, overrides) {
  if (value === null || value === undefined || value === "") return "";
  const override = overrideFor(value, overrides);
  if (override) return typeof override === "string" ? override : override.label;
  const normalized = normalizeEnum(value);
  return STATUS_LABELS[normalized] ?? "Trạng thái chưa xác định";
}

export function statusTone(value, overrides) {
  const override = overrideFor(value, overrides);
  if (override && typeof override === "object" && override.tone) return override.tone;
  return STATUS_TONES[normalizeEnum(value)] ?? "neutral";
}

export function getStatusMeta(value, overrides) {
  return {
    value: normalizeEnum(value),
    label: statusLabel(value, overrides),
    tone: statusTone(value, overrides),
  };
}

export function roleLabel(value) {
  return humanizeEnum(value, ROLE_LABELS);
}

export function transactionTypeLabel(value) {
  return humanizeEnum(value, TRANSACTION_TYPE_LABELS);
}

export function bedTypeLabel(value) {
  return humanizeEnum(value, BED_TYPE_LABELS);
}

export function reasonLabel(value) {
  return humanizeEnum(value, REASON_LABELS);
}
