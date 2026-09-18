import { AlertTriangle, FileImage, Send, ShieldCheck } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button, FormField, Input, Modal, Select, Textarea } from "../ui";
import { createComplaint } from "../../services/complaintService";
import { friendlyErrorMessage } from "../../utils/userFacingText";
import "./ComplaintCenter.css";

const ISSUE_OPTIONS = [
  ["ROOM_OR_AMENITIES", "Phòng hoặc tiện nghi"],
  ["SERVICE_QUALITY", "Chất lượng dịch vụ"],
  ["CHECK_IN_OR_QR", "Nhận phòng hoặc mã nhận phòng"],
  ["PAYMENT_OR_DEPOSIT", "Thanh toán hoặc đặt cọc"],
  ["CANCELLATION_OR_REFUND", "Hủy phòng hoặc hoàn tiền"],
  ["PRICE_OR_SURCHARGE", "Giá hoặc phụ phí"],
  ["SAFETY_OR_SECURITY", "An toàn hoặc an ninh"],
  ["HOTEL_HOUSE_RULES", "Quy định của khách sạn"],
  ["OTHER", "Vấn đề khác"],
];

export default function ComplaintCreateModal({ booking, hotel, roomType, open, onClose, onCreated }) {
  const [form, setForm] = useState({ issueType: "ROOM_OR_AMENITIES", title: "", description: "", disputedAmount: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const bookingLabel = useMemo(() => booking?.bookingCode ?? "Đơn đặt phòng đang chọn", [booking]);

  function close() {
    if (busy) return;
    setForm({ issueType: "ROOM_OR_AMENITIES", title: "", description: "", disputedAmount: "" });
    setFiles([]);
    setError("");
    onClose?.();
  }

  async function submit(event) {
    event.preventDefault();
    if (!booking?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await createComplaint({
        bookingId: booking.id,
        issueType: form.issueType,
        title: form.title.trim(),
        description: form.description.trim(),
        disputedAmount: form.disputedAmount ? Number(form.disputedAmount) : null,
      }, files);
      onCreated?.(created);
      setForm({ issueType: "ROOM_OR_AMENITIES", title: "", description: "", disputedAmount: "" });
      setFiles([]);
      setError("");
      onClose?.();
    } catch (requestError) {
      setError(friendlyErrorMessage(requestError, "Không thể gửi khiếu nại. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} size="lg" className="complaint-create-modal"
      backdropClassName="complaint-create-backdrop"
      bodyClassName="complaint-create-modal-body"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      title="Gửi khiếu nại"
      description="Mô tả sự việc và gửi tài liệu liên quan để khách sạn kiểm tra."
      footer={(
        <div className="complaint-modal-actions">
          <Button variant="secondary" onClick={close} disabled={busy}>Hủy</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Đang gửi..." startIcon={<Send size={18} />}
            disabled={!form.title.trim() || !form.description.trim()}>Gửi khiếu nại</Button>
        </div>
      )}>
      <form id={formId} className="complaint-create-form" onSubmit={submit}>
        <div className="complaint-booking-lock">
          <ShieldCheck size={22} />
          <div><span>{bookingLabel}</span><strong>{hotel?.name ?? "Đang tải tên khách sạn"}</strong>
            <small>{roomType?.name ?? "Thông tin phòng trong đơn"}</small></div>
        </div>

        <div className="complaint-form-grid">
          <FormField label="Loại vấn đề" required>
            <Select value={form.issueType} onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value }))}>
              {ISSUE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </FormField>
          <FormField label="Số tiền khiếu nại (₫)" hint="Không bắt buộc. Chỉ điền nếu khiếu nại liên quan đến tiền.">
            <Input type="number" min="1" step="1" inputMode="numeric" placeholder="Ví dụ: 500000"
              value={form.disputedAmount} onChange={(event) => setForm((current) => ({ ...current, disputedAmount: event.target.value }))} />
          </FormField>
        </div>
        <FormField label="Tiêu đề" required>
          <Input maxLength={180} value={form.title} placeholder="Tóm tắt ngắn vấn đề cần hỗ trợ"
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </FormField>
        <FormField label="Mô tả chi tiết" required hint="Nêu thời điểm, diễn biến và hướng xử lý bạn mong muốn từ khách sạn.">
          <Textarea rows={6} maxLength={5000} value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </FormField>
        <FormField label="Ảnh hoặc tài liệu" hint="Tối đa 8 tệp JPG, PNG, WEBP hoặc PDF; 10 MB mỗi tệp.">
          <label className="complaint-file-picker">
            <FileImage size={20} />
            <span>{files.length ? `Đã chọn ${files.length} tệp` : "Chọn ảnh hoặc tài liệu"}</span>
            <input aria-label="Chọn ảnh hoặc tài liệu" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setFiles([...event.target.files].slice(0, 8))} />
          </label>
        </FormField>
        {error ? <div className="complaint-inline-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}
      </form>
    </Modal>
  );
}
