export const COMPLAINT_STATUS_LABELS = {
  SUBMITTED: "Chờ khách sạn tiếp nhận",
  UNDER_REVIEW: "Khách sạn đang xem xét",
  WAITING_FOR_HOTEL: "Chờ khách sạn phản hồi",
  WAITING_FOR_CUSTOMER: "Chờ khách hàng bổ sung",
  RESOLVING: "Khách sạn đang xử lý",
  ESCALATED: "Chờ EnziuRooms xem xét",
  SYSTEM_REVIEW: "EnziuRooms đang xem xét",
  HOTEL_ACTION_REQUIRED: "Chờ khách sạn khắc phục",
  AWAITING_SYSTEM_CONFIRMATION: "Chờ xác nhận kết quả",
  RESOLVED: "Đã giải quyết",
  REJECTED: "Khiếu nại không được chấp nhận",
  CANCELLED: "Khách hàng đã hủy",
};

export const isTerminal = (status) => ["RESOLVED", "REJECTED", "CANCELLED"].includes(status);
export const isRefundResolution = (type) => ["FULL_REFUND_ACCEPTED", "PARTIAL_REFUND_ACCEPTED"].includes(type);

export function hotelActionsFor(complaint) {
  if (!complaint || isTerminal(complaint.status)) return [];
  if (complaint.status === "HOTEL_ACTION_REQUIRED") return [["COMPLETE_REQUIRED_ACTION", "Gửi kết quả khắc phục và ảnh, tài liệu"]];
  if (complaint.escalatedAt) return [];
  return [
    ["START_REVIEW", "Tiếp nhận và xem xét"],
    ["REQUEST_CUSTOMER_EVIDENCE", "Nhờ khách hàng bổ sung thông tin"],
    ["RESOLVE", "Đã khắc phục và giải quyết cho khách"],
    ["ESCALATE", "Chưa thống nhất · nhờ EnziuRooms xem xét"],
  ];
}

export function adminActionsFor(complaint) {
  if (!complaint?.escalatedAt || isTerminal(complaint.status)) return [];
  if (complaint.status === "AWAITING_SYSTEM_CONFIRMATION") return [
    ["RESOLVED", "Xác nhận đã giải quyết xong"],
    ["HOTEL_ACTION_REQUIRED", "Yêu cầu khách sạn thực hiện lại"],
  ];
  if (complaint.status === "HOTEL_ACTION_REQUIRED") return [];
  return [
    ["SYSTEM_REVIEW", "Bắt đầu xem xét khiếu nại"],
    ["WAITING_FOR_CUSTOMER", "Nhờ khách hàng bổ sung thông tin"],
    ["HOTEL_ACTION_REQUIRED", "Yêu cầu khách sạn khắc phục hoặc hoàn tiền"],
    ["REJECTED", "Không chấp nhận khiếu nại và nêu lý do"],
  ];
}

// Explain the current responsibility without exposing workflow codes in the UI.
export function complaintNextStep(complaint, mode) {
  const reviewer = complaint?.escalatedAt ? "EnziuRooms" : "Khách sạn";
  const steps = {
    SUBMITTED: ["Khách sạn", "Chờ khách sạn tiếp nhận", "Khách sạn sẽ xem nội dung và phản hồi khiếu nại. Bạn có thể bổ sung ảnh hoặc tài liệu để làm rõ vấn đề."],
    UNDER_REVIEW: ["Khách sạn", "Khách sạn đang tìm hiểu sự việc", "Khách sạn đang xem nội dung và các tài liệu đã gửi để đưa ra hướng giải quyết."],
    WAITING_FOR_HOTEL: ["Khách sạn", "Cần phản hồi từ khách sạn", "Khách sạn cần làm rõ sự việc và cập nhật hướng giải quyết trong phần trao đổi bên dưới."],
    WAITING_FOR_CUSTOMER: ["Khách hàng", "Cần thêm thông tin từ khách hàng", `Xem yêu cầu trong phần trao đổi và bổ sung ảnh hoặc tài liệu để ${reviewer} tiếp tục xem xét.`],
    RESOLVING: ["Khách sạn", "Khách sạn đang giải quyết", "Khách sạn đang khắc phục vấn đề và sẽ cập nhật kết quả tại đây."],
    ESCALATED: ["EnziuRooms", "EnziuRooms sẽ hỗ trợ hai bên", "Khách sạn và khách hàng chưa thống nhất. EnziuRooms sẽ xem phản hồi của cả hai bên và đưa ra hướng giải quyết."],
    SYSTEM_REVIEW: ["EnziuRooms", "Đang xem xét phản hồi của hai bên", "EnziuRooms đang kiểm tra thông tin để đưa ra hướng giải quyết cho khiếu nại này."],
    HOTEL_ACTION_REQUIRED: ["Khách sạn", "Chờ khách sạn thực hiện yêu cầu", "Khách sạn cần khắc phục theo yêu cầu bên dưới và gửi ảnh hoặc tài liệu xác nhận. EnziuRooms sẽ kiểm tra kết quả trước khi kết thúc khiếu nại."],
    AWAITING_SYSTEM_CONFIRMATION: ["EnziuRooms", "Khách sạn đã gửi kết quả khắc phục", "EnziuRooms cần kiểm tra kết quả và chứng từ. Nếu chưa đầy đủ, khách sạn sẽ được yêu cầu bổ sung."],
    RESOLVED: [null, "Khiếu nại đã được giải quyết", "Bạn có thể xem kết quả và toàn bộ trao đổi bên dưới."],
    REJECTED: [null, "Đã có kết quả xem xét", "Khiếu nại không được chấp nhận. Xem lý do và nội dung phản hồi bên dưới."],
    CANCELLED: [null, "Khách hàng đã hủy khiếu nại", "Khiếu nại này đã dừng xử lý. Nội dung và các trao đổi trước đó vẫn được lưu lại."],
  };
  const [owner, title, description] = steps[complaint?.status] ?? [null, "Theo dõi khiếu nại", "Xem các cập nhật mới nhất trong phần trao đổi bên dưới."];
  const canAct = !isTerminal(complaint?.status) && (mode === "customer"
    || mode === "hotel" || (mode === "admin" && adminActionsFor(complaint).length > 0));
  return { owner, title, description, canAct };
}
