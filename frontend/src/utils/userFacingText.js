const TECHNICAL_MESSAGE_PATTERN = /\b(exception|stack\s*trace|internal server error|bad gateway|service unavailable|gateway timeout|network error|sql|constraint|feign|axios|endpoint|backend|database|api key|localhost|docker|container|java\.|org\.|spring|postgres|redis|undefined|null)\b/i;
const RAW_CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{4,}$/;

function messageForStatus(status) {
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Nội dung bạn đang tìm không còn khả dụng.";
  if (status === 409) return "Thông tin đã thay đổi. Vui lòng tải lại và thử lần nữa.";
  if (status === 413) return "Tệp đã chọn vượt quá dung lượng cho phép.";
  if (status === 429) return "Bạn thao tác hơi nhanh. Vui lòng chờ một chút rồi thử lại.";
  if (status >= 500) return "EnziuRooms đang gặp gián đoạn tạm thời. Vui lòng thử lại sau ít phút.";
  return "Chưa thể hoàn tất thao tác. Vui lòng thử lại.";
}

export function humanizeUserMessage(value, {
  status = 0,
  fallback = "Chưa thể hoàn tất thao tác. Vui lòng thử lại.",
} = {}) {
  const message = String(value ?? "").trim();
  if (!message) return fallback;

  const normalized = message.toLowerCase();
  if (normalized === "network error" || normalized.includes("failed to fetch")) {
    return "Không thể kết nối đến EnziuRooms. Vui lòng kiểm tra mạng và thử lại.";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "Kết nối mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
  }
  if (RAW_CODE_PATTERN.test(message) || TECHNICAL_MESSAGE_PATTERN.test(message)) {
    return messageForStatus(Number(status) || 0) || fallback;
  }

  return message
    .replace(/\bSystem Admin\b/gi, "bộ phận quản trị EnziuRooms")
    .replace(/\bHotel Admin\b/gi, "khách sạn")
    .replace(/\bCustomer\b/gi, "khách hàng");
}

export function friendlyErrorMessage(error, fallback) {
  const status = Number(error?.response?.status ?? 0);
  const raw = error?.response?.data?.message
    ?? error?.response?.data?.detail
    ?? error?.message;
  return humanizeUserMessage(raw, { status, fallback });
}
