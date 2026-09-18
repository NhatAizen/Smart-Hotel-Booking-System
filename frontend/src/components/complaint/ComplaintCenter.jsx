import {
  AlertCircle,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FileImage,
  FileText,
  Hotel,
  LoaderCircle,
  MessageSquareReply,
  Paperclip,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldAlert,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button, EmptyState, FormField, PageHeader, Select, Textarea } from "../ui";
import {
  addComplaintEvidence,
  actOnHotelComplaint,
  cancelComplaint,
  getAdminComplaints,
  getComplaintEvidence,
  getHotelComplaints,
  getMyComplaints,
  respondToComplaint,
  updateAdminComplaint,
} from "../../services/complaintService";
import {
  getAdminRefundRequests,
  getBookingPayments,
  getHotelRefundRequests,
  getRefundRequestByBooking,
} from "../../services/paymentService";
import { friendlyErrorMessage } from "../../utils/userFacingText";
import "./ComplaintCenter.css";
import { COMPLAINT_STATUS_LABELS as STATUS_LABELS, isTerminal, isRefundResolution,
  hotelActionsFor, adminActionsFor, complaintNextStep } from "./complaintWorkflow";

const ISSUE_LABELS = {
  ROOM_OR_AMENITIES: "Phòng hoặc tiện nghi",
  SERVICE_QUALITY: "Chất lượng dịch vụ",
  CHECK_IN_OR_QR: "Nhận phòng hoặc mã nhận phòng",
  PAYMENT_OR_DEPOSIT: "Thanh toán / đặt cọc",
  CANCELLATION_OR_REFUND: "Hủy phòng / hoàn tiền",
  PRICE_OR_SURCHARGE: "Giá / phụ phí",
  SAFETY_OR_SECURITY: "An toàn / an ninh",
  HOTEL_HOUSE_RULES: "Quy định khách sạn",
  OTHER: "Vấn đề khác",
};
const ACTOR_LABELS = {
  CUSTOMER: "Khách hàng",
  HOTEL_ADMIN: "Khách sạn",
  SYSTEM_ADMIN: "EnziuRooms",
  SYSTEM: "EnziuRooms",
};
function filterGroupsFor(mode) {
  const waitingStatus = mode === "admin" ? "ESCALATED" : "SUBMITTED";
  return [
  { value: "ALL", label: "Tất cả", matches: () => true },
  { value: "NEW", label: "Chờ tiếp nhận", matches: (item) => item.status === waitingStatus },
  { value: "IN_PROGRESS", label: "Đang xử lý", matches: (item) => item.status !== waitingStatus && !isTerminal(item.status) },
  { value: "CLOSED", label: "Đã kết thúc", matches: (item) => isTerminal(item.status) },
  ];
}
const RESOLUTION_OPTIONS = [
  ["EXPLANATION_NO_FURTHER_ACTION", "Đã giải thích, không cần xử lý thêm"],
  ["HOTEL_SUPPORT_REQUIRED", "Yêu cầu khách sạn khắc phục"],
  ["FULL_REFUND_ACCEPTED", "Yêu cầu khách sạn hoàn toàn bộ tiền"],
  ["PARTIAL_REFUND_ACCEPTED", "Yêu cầu khách sạn hoàn một phần tiền"],
  ["REJECTED_INSUFFICIENT_EVIDENCE", "Từ chối do thiếu bằng chứng"],
  ["REJECTED_CUSTOMER_AT_FAULT", "Không chấp nhận do nội dung khiếu nại không đúng"],
  ["HOTEL_ACKNOWLEDGED_FAULT", "Khách sạn xác nhận sai sót"],
  ["MUTUAL_AGREEMENT", "Hai bên đã thỏa thuận"],
  ["ESCALATED_HOTEL_VIOLATION", "Chuyển xử lý vi phạm khách sạn"],
];

function formatDateTime(value) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
function money(value) {
  if (value === null || value === undefined) return "Không áp dụng";
  return `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`;
}
function complaintStatusLabel(status) { return STATUS_LABELS[status] ?? "Đang cập nhật"; }

function isLegacyQaFixture(item) {
  return item?.title === "[QA] Xác minh full flow Complaint"
    && item?.description === "Case QA dùng booking thật để xác minh quyền, timeline, evidence và liên kết refund hiện hữu.";
}

function EvidenceTile({ item }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const image = item.contentType?.startsWith("image/");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getComplaintEvidence(item.contentUrl).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {}).finally(() => active && setLoading(false));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.contentUrl]);
  return (
    <a className="complaint-evidence-tile" href={url || undefined} target="_blank" rel="noreferrer"
      aria-label={`Mở tài liệu ${item.fileName}`}>
      <span className="complaint-evidence-preview">
        {loading ? <LoaderCircle className="spin" size={22} />
          : image && url ? <img src={url} alt={`Ảnh đính kèm ${item.fileName}`} loading="lazy" decoding="async" /> : <FileText size={28} />}
      </span>
      <span><strong>{item.fileName}</strong><small>{ACTOR_LABELS[item.uploaderRole]} · {(item.fileSize / 1024).toFixed(0)} KB</small></span>
    </a>
  );
}

export default function ComplaintCenter({ mode }) {
  const [searchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("case") ?? "";
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [hotelForm, setHotelForm] = useState({ action: "START_REVIEW", refundRequestId: "", refundedAmount: "" });
  const [adminForm, setAdminForm] = useState({ status: "SYSTEM_REVIEW", resolutionType: "", note: "", refundRequestId: "", severity: "NORMAL", requiredRefundAmount: "", violationReviewRecommended: null, refundVerified: false });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = mode === "admin" ? await getAdminComplaints()
        : mode === "hotel" ? await getHotelComplaints() : await getMyComplaints();
      // Older API instances may briefly serve this historical fixture before
      // the migration that marks it internal has run.
      const normalized = Array.isArray(data) ? data.filter((item) => !isLegacyQaFixture(item)) : [];
      setItems(normalized);
      setSelectedId((current) => {
        if (requestedCaseId && normalized.some((item) => String(item.id) === requestedCaseId)) {
          return requestedCaseId;
        }
        return normalized.some((item) => String(item.id) === String(current))
          ? current
          : (normalized[0]?.id ?? "");
      });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải danh sách khiếu nại.");
    } finally { setLoading(false); }
  }, [mode, requestedCaseId]);

  useEffect(() => { void load(); }, [load]);
  const filterGroups = useMemo(() => filterGroupsFor(mode), [mode]);
  const activeFilter = filterGroups.find((group) => group.value === filter) ?? filterGroups[0];
  const visibleItems = useMemo(() => items.filter(activeFilter.matches), [activeFilter, items]);
  const selected = useMemo(
    () => visibleItems.find((item) => String(item.id) === String(selectedId)) ?? visibleItems[0] ?? null,
    [visibleItems, selectedId],
  );
  const hotelActions = hotelActionsFor(selected);
  const adminActions = adminActionsFor(selected);
  const nextStep = complaintNextStep(selected, mode);
  const hotelAction = hotelActions.some(([value]) => value === hotelForm.action) ? hotelForm.action : hotelActions[0]?.[0];
  const adminStatus = adminActions.some(([value]) => value === adminForm.status) ? adminForm.status : adminActions[0]?.[0];
  const adminResolution = adminStatus === "REJECTED"
    ? (["REJECTED_CUSTOMER_AT_FAULT", "REJECTED_INSUFFICIENT_EVIDENCE"].includes(adminForm.resolutionType) ? adminForm.resolutionType : "REJECTED_CUSTOMER_AT_FAULT")
    : (["HOTEL_SUPPORT_REQUIRED", "FULL_REFUND_ACCEPTED", "PARTIAL_REFUND_ACCEPTED"].includes(adminForm.resolutionType || selected?.resolutionType) ? adminForm.resolutionType || selected.resolutionType : "HOTEL_SUPPORT_REQUIRED");
  const requiredRefundAmount = adminForm.requiredRefundAmount === "" ? selected?.requiredRefundAmount ?? "" : adminForm.requiredRefundAmount;

  function selectCase(item) {
    setSelectedId(item.id); setMessage(""); setFiles([]);
    setHotelForm({ action: hotelActionsFor(item)[0]?.[0] ?? "", refundRequestId: item.refundRequestId ?? "", refundedAmount: item.requiredRefundAmount ?? "" });
    setAdminForm({ status: adminActionsFor(item)[0]?.[0] ?? "", resolutionType: item.resolutionType ?? "",
      note: "", refundRequestId: "", severity: item.severity ?? "NORMAL", requiredRefundAmount: item.requiredRefundAmount ?? "",
      violationReviewRecommended: item.violationReviewRecommended ?? false, refundVerified: false });
  }

  function selectFilter(group) {
    setFilter(group.value);
    if (!selected || !group.matches(selected)) {
      const next = items.find(group.matches);
      if (next) selectCase(next);
    }
  }

  useEffect(() => {
    if (!selected) { setPayments([]); setRefunds([]); return; }
    let active = true;
    async function loadFinance() {
      const paymentResult = await getBookingPayments(selected.bookingId).catch(() => []);
      let refundResult;
      if (mode === "admin") refundResult = await getAdminRefundRequests().catch(() => []);
      else if (mode === "hotel") refundResult = await getHotelRefundRequests().catch(() => []);
      else {
        const one = await getRefundRequestByBooking(selected.bookingId).catch(() => null);
        refundResult = one ? [one] : [];
      }
      if (!active) return;
      setPayments(Array.isArray(paymentResult) ? paymentResult : []);
      setRefunds((Array.isArray(refundResult) ? refundResult : []).filter((item) => String(item.bookingId) === String(selected.bookingId)));
    }
    void loadFinance();
    return () => { active = false; };
  }, [mode, selected]);

  function updateItem(updated) {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedId(updated.id);
    if (!activeFilter.matches(updated)) setFilter("ALL");
  }
  async function submitEvidence(event) {
    event.preventDefault(); if (!selected || !files.length) return;
    setBusy(true); setError("");
    try { updateItem(await addComplaintEvidence(selected.id, files, message)); setFiles([]); setMessage(""); }
    catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể gửi ảnh hoặc tài liệu. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  async function submitHotelResponse(event) {
    event.preventDefault(); if (!selected || !message.trim()) return;
    setBusy(true); setError("");
    try { updateItem(await respondToComplaint(selected.id, message.trim(), files)); setFiles([]); setMessage(""); }
    catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể gửi phản hồi."); }
    finally { setBusy(false); }
  }
  async function submitHotelAction(event) {
    event.preventDefault(); if (!selected || !hotelAction || !message.trim()) return;
    setBusy(true); setError("");
    try {
      updateItem(await actOnHotelComplaint(selected.id, { action: hotelAction, message: message.trim(),
        refundRequestId: hotelForm.refundRequestId || null,
        refundedAmount: hotelForm.refundedAmount === "" ? null : Number(hotelForm.refundedAmount) }, files));
      setMessage(""); setFiles([]);
    } catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể cập nhật xử lý khiếu nại."); }
    finally { setBusy(false); }
  }
  async function submitAdmin(event) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError("");
    try {
      updateItem(await updateAdminComplaint(selected.id, { ...adminForm, status: adminStatus,
        resolutionType: ["HOTEL_ACTION_REQUIRED", "REJECTED"].includes(adminStatus) ? adminResolution : null,
        requiredRefundAmount: adminStatus === "HOTEL_ACTION_REQUIRED" && isRefundResolution(adminResolution)
          ? Number(requiredRefundAmount) : null,
        refundRequestId: null, visibleToCustomer: true }));
      setAdminForm((current) => ({ ...current, note: "", refundVerified: false }));
    } catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể cập nhật khiếu nại."); }
    finally { setBusy(false); }
  }
  async function cancelCurrent() {
    if (!selected || !window.confirm("Bạn chắc chắn muốn hủy khiếu nại này?")) return;
    setBusy(true);
    try { updateItem(await cancelComplaint(selected.id)); } catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể hủy khiếu nại."); }
    finally { setBusy(false); }
  }

  const title = mode === "customer" ? "Khiếu nại của tôi" : "Quản lý khiếu nại";
  const subtitle = mode === "admin" ? "Xem khiếu nại được chuyển đến EnziuRooms và phản hồi cho hai bên."
    : mode === "hotel" ? "Tiếp nhận và xử lý khiếu nại của khách hàng."
      : "Xem phản hồi và bổ sung thông tin cho khiếu nại đã gửi.";

  return (
    <div className={`complaint-center complaint-center--${mode}`}>
      <PageHeader title={title} description={subtitle}
        actions={<Button variant="secondary" startIcon={<RefreshCw size={17} />} onClick={() => void load()}>Làm mới</Button>} />
      {error ? <div className="complaint-banner-error" role="alert"><AlertCircle size={19} />{friendlyErrorMessage({ message: error }, "Chưa thể xử lý yêu cầu lúc này.")}</div> : null}
      <div className="complaint-filter-row" role="group" aria-label="Lọc khiếu nại theo trạng thái">
        {filterGroups.map((group) => (
          <button key={group.value} type="button" className={filter === group.value ? "active" : ""}
            aria-pressed={filter === group.value} onClick={() => selectFilter(group)}>
            <span className="complaint-filter-label"><Check size={16} className="complaint-filter-check" aria-hidden="true" />{group.label}</span>
            <span className="complaint-filter-count">{loading ? "—" : items.filter(group.matches).length}</span>
          </button>
        ))}
      </div>
      {loading ? <div className="complaint-loading" role="status" aria-live="polite"><LoaderCircle className="spin" />Đang tải khiếu nại...</div>
        : items.length === 0 ? <EmptyState icon={<ShieldAlert size={32} />} title="Chưa có khiếu nại"
          description={mode === "customer" ? "Bạn có thể gửi khiếu nại từ phần Chi tiết đơn đặt phòng." : "Các khiếu nại cần bạn theo dõi sẽ xuất hiện tại đây."}
          actions={mode === "customer" ? <Link to="/customer/bookings">Mở đơn đặt phòng</Link> : undefined} />
          : visibleItems.length === 0 ? <EmptyState icon={<ShieldAlert size={28} />}
            title={`Không có khiếu nại trong nhóm “${activeFilter.label}”`}
            description="Chọn nhóm khác để xem các khiếu nại của bạn."
            actions={<Button variant="secondary" onClick={() => selectFilter(filterGroups[0])}>Xem tất cả</Button>} />
          : (
            <div className="complaint-workspace">
              <aside className="complaint-case-list" aria-label="Danh sách khiếu nại">
                <div className="complaint-list-heading"><h2>Danh sách khiếu nại</h2><span>{visibleItems.length}</span></div>
                {visibleItems.map((item) => (
                  <button key={item.id} type="button" className={`complaint-case-card ${String(item.id) === String(selected?.id) ? "active" : ""}`}
                    aria-pressed={String(item.id) === String(selected?.id)}
                    onClick={() => selectCase(item)}>
                    <span className="complaint-case-selection"><CheckCircle2 size={14} aria-hidden="true" />Đang xem</span>
                    <span className={`complaint-status status-${item.status.toLowerCase()}`}>{complaintStatusLabel(item.status)}</span>
                    <strong>{item.title}</strong><span className="complaint-case-excerpt">{item.description}</span>
                    <small><Hotel size={14} />{item.hotelName}</small>
                    <span>{item.complaintCode}</span>
                    <time>Cập nhật {formatDateTime(item.updatedAt)}</time><ChevronRight size={18} />
                  </button>
                ))}
              </aside>
              {selected ? (
                <section className="complaint-detail" aria-label={`Chi tiết ${selected.complaintCode}`}>
                  <header className="complaint-detail-hero">
                    <div><span className="complaint-issue-label"><MessageSquareReply size={16} />{ISSUE_LABELS[selected.issueType] ?? "Vấn đề cần hỗ trợ"}</span><h2>{selected.title}</h2>
                      <p>Mã khiếu nại: {selected.complaintCode}<span aria-hidden="true"> · </span>Gửi lúc {formatDateTime(selected.createdAt)}</p></div>
                    <span className={`complaint-status status-${selected.status.toLowerCase()}`}>{complaintStatusLabel(selected.status)}</span>
                  </header>
                  {!isTerminal(selected.status) || !selected.resolutionType ? <section className={`complaint-next-step ${isTerminal(selected.status) ? "is-ended" : ""}`} aria-label="Tình trạng xử lý">
                    <span className="complaint-next-step-icon">{isTerminal(selected.status) ? <FileText size={23} /> : <CalendarClock size={23} />}</span>
                    <div><span className="complaint-section-label">{isTerminal(selected.status) ? "Kết quả" : "Cần xử lý"}</span>
                      <h3>{nextStep.title}</h3><p>{nextStep.description}</p>
                      {nextStep.owner ? <span className="complaint-owner">Cần phản hồi từ: <strong>{nextStep.owner}</strong></span> : null}
                    </div>
                    <a href={nextStep.canAct ? "#complaint-action" : "#complaint-history"}>{nextStep.canAct ? (mode === "customer" ? "Bổ sung thông tin" : "Phản hồi khiếu nại") : "Xem trao đổi"}<ChevronRight size={16} /></a>
                  </section> : null}
                  <article className="complaint-description"><h3><FileText size={20} />Nội dung khiếu nại</h3><p>{selected.description}</p>
                    {selected.disputedAmount != null ? <div className="complaint-disputed-amount"><BadgeDollarSign size={19} /><span>Số tiền khiếu nại<strong>{money(selected.disputedAmount)}</strong>{!isTerminal(selected.status) ? <small>Số tiền được hoàn phụ thuộc vào kết quả xử lý.</small> : null}</span></div> : null}
                  </article>
                  {selected.resolutionType ? <section className="complaint-resolution"><FileText size={24} /><div><span>{selected.resolvedByRole === "HOTEL_ADMIN" ? "Kết quả xử lý của khách sạn" : "Hướng giải quyết từ EnziuRooms"}</span>
                    <strong>{selected.status === "RESOLVED" && selected.requiredRefundAmount != null ? "Đã xác nhận khách sạn hoàn tiền" : RESOLUTION_OPTIONS.find(([value]) => value === selected.resolutionType)?.[1] ?? "Kết quả xem xét"}</strong><p>{selected.resolutionNote}</p></div></section> : null}
                  {selected.requiredRefundAmount != null ? <div className="complaint-workflow-note"><BadgeDollarSign size={21} /><div><strong>{selected.status === "RESOLVED" ? "Số tiền đã xác nhận hoàn" : "Số tiền khách sạn phải hoàn"}: {money(selected.requiredRefundAmount)}</strong>
                    <p>{selected.status === "RESOLVED" ? "EnziuRooms đã xác nhận kết quả hoàn tiền và kết thúc khiếu nại." : `${selected.hotelReportedRefundAmount != null ? `Khách sạn báo đã hoàn ${money(selected.hotelReportedRefundAmount)}. ` : ""}Khách sạn cần gửi chứng từ để EnziuRooms kiểm tra trước khi kết thúc khiếu nại.`}</p></div></div> : null}
                  {selected.violationReviewRecommended ? <p className="complaint-risk-signal"><ShieldAlert size={18} />EnziuRooms đã ghi nhận vấn đề trong cách khách sạn xử lý khiếu nại này.</p> : null}
                  <div className="complaint-context-grid">
                    <article><Building2 size={20} /><span>Khách sạn</span><strong>{selected.hotelName}</strong><small>{selected.roomTypeName ?? selected.roomNumber ?? "Phòng trong đơn"}</small></article>
                    <article><CircleUserRound size={20} /><span>Khách hàng</span><strong>{selected.customerName}</strong><small>Đơn đặt phòng: {selected.bookingCode}</small></article>
                    <article><CalendarClock size={20} /><span>Thời gian lưu trú</span><strong>{formatDate(selected.booking?.checkIn)} → {formatDate(selected.booking?.checkOut)}</strong><small>{selected.booking?.adults ?? 0} người lớn · {selected.booking?.children ?? 0} trẻ em</small>
                      {mode === "admin" ? <small className="complaint-stay-status">{selected.booking?.checkedOutAt ? `Đã trả phòng · ${formatDateTime(selected.booking.checkedOutAt)}` : selected.booking?.checkedInAt ? `Đã nhận phòng · ${formatDateTime(selected.booking.checkedInAt)}` : "Chưa có thông tin nhận phòng"}</small> : null}</article>
                  </div>
                  <div className="complaint-detail-columns">
                    <section id="complaint-history" className="complaint-timeline-panel"><h3><MessageSquareReply size={20} />Lịch sử trao đổi</h3>
                      {!selected.timeline.length ? <p className="complaint-muted">Các phản hồi và cập nhật sẽ xuất hiện tại đây.</p> : null}
                      <ol>{selected.timeline.map((entry) => <li key={entry.id}><span className={`timeline-dot role-${entry.actorRole.toLowerCase()}`} />
                        <div><strong>{ACTOR_LABELS[entry.actorRole]}</strong><time>{formatDateTime(entry.createdAt)}</time>
                          {entry.toStatus ? <span className="complaint-timeline-status">{complaintStatusLabel(entry.toStatus)}</span> : null}
                          <p>{entry.message ?? "Đã cập nhật khiếu nại"}</p></div></li>)}</ol>
                    </section>
                    <section className="complaint-evidence-panel"><h3><Paperclip size={20} />Ảnh & tài liệu ({selected.evidence.length})</h3>
                      {selected.evidence.length ? <div className="complaint-evidence-grid">{selected.evidence.map((item) => <EvidenceTile item={item} key={item.id} />)}</div>
                        : <div className="complaint-evidence-empty"><FileImage size={30} /><p>Chưa có ảnh hoặc tài liệu</p><small>Ảnh sự việc, hóa đơn và các tài liệu đính kèm sẽ xuất hiện ở đây.</small></div>}
                    </section>
                  </div>
                  <section className="complaint-finance-panel"><h3><WalletCards size={20} />Thanh toán & hoàn tiền</h3>
                    <div className="complaint-finance-grid"><div><span>Tổng tiền</span><strong>{money(selected.booking?.totalPrice)}</strong></div>
                      <div><span>Đã thanh toán</span><strong>{money(selected.booking?.paidAmount)}</strong></div>
                      <div><span>Còn lại</span><strong>{money(selected.booking?.remainingAmount)}</strong></div>
                      <div><span>Đặt cọc</span><strong>{selected.booking?.depositPercent == null ? "Không áp dụng" : `${selected.booking.depositPercent}%`}</strong></div></div>
                    <div className="complaint-linked-records"><span><ReceiptText size={16} />{payments.length} giao dịch thanh toán</span>
                      <span><RefreshCw size={16} />{refunds.length ? `${refunds.length} yêu cầu hoàn tiền` : "Chưa có yêu cầu hoàn tiền"}</span></div>
                    {selected.refundRequestId ? <p className="complaint-refund-link"><CheckCircle2 size={16} />Đã ghi nhận yêu cầu hoàn tiền cho đơn {selected.bookingCode}.</p> : null}
                  </section>
                  {!isTerminal(selected.status) && mode === "customer" ? <form id="complaint-action" className="complaint-action-panel" onSubmit={submitEvidence}><h3>Bổ sung thông tin</h3>
                    <FormField label="Thông tin bổ sung" hint="Đính kèm ảnh hoặc tài liệu để gửi thông tin cho người đang xử lý."><Textarea rows={3} placeholder="Bạn muốn làm rõ điều gì về sự việc?" value={message} onChange={(event) => setMessage(event.target.value)} /></FormField>
                    <EvidenceInput files={files} setFiles={setFiles} /><div className="complaint-action-buttons">{!["HOTEL_ACTION_REQUIRED", "AWAITING_SYSTEM_CONFIRMATION"].includes(selected.status) ? <Button variant="danger" onClick={() => void cancelCurrent()} disabled={busy} startIcon={<XCircle size={17} />}>Hủy khiếu nại</Button> : null}
                      <Button type="submit" loading={busy} disabled={!files.length} startIcon={<Upload size={17} />}>Gửi thông tin bổ sung</Button></div></form> : null}
                  {!isTerminal(selected.status) && mode === "hotel" && hotelActions.length > 0 ? <form id="complaint-action" className="complaint-action-panel" onSubmit={submitHotelAction}><h3>Xử lý khiếu nại tại khách sạn</h3>
                    <FormField label="Hướng xử lý" required><Select value={hotelAction} onChange={(event) => setHotelForm((current) => ({ ...current, action: event.target.value }))}>
                      {hotelActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
                    {hotelAction === "ESCALATE" ? <p className="complaint-workflow-note">Nêu rõ điểm chưa thống nhất và đính kèm tài liệu liên quan. EnziuRooms sẽ xem phản hồi của cả hai bên để đưa ra hướng giải quyết.</p> : null}
                    {hotelAction === "COMPLETE_REQUIRED_ACTION" ? <p className="complaint-workflow-note">Mô tả việc đã khắc phục và đính kèm ít nhất một ảnh hoặc tài liệu xác nhận. EnziuRooms sẽ kiểm tra kết quả bạn gửi.</p> : null}
                    {hotelAction === "COMPLETE_REQUIRED_ACTION" && selected.requiredRefundAmount != null ? <>
                      <FormField label="Số tiền đã hoàn" required><input type="number" min={selected.requiredRefundAmount} step="0.01" required value={hotelForm.refundedAmount} onChange={(event) => setHotelForm((current) => ({ ...current, refundedAmount: event.target.value }))} /></FormField>
                      <FormField label="Giao dịch hoàn tiền" hint="Chọn giao dịch đã hoàn tất, hoặc đính kèm chứng từ chuyển khoản để EnziuRooms kiểm tra."><Select value={hotelForm.refundRequestId} onChange={(event) => setHotelForm((current) => ({ ...current, refundRequestId: event.target.value }))}>
                        <option value="">Đính kèm chứng từ hoàn tiền để xác minh</option>{refunds.filter((item) => item.status === "COMPLETED").map((item) => <option key={item.id} value={item.id}>{selected.bookingCode} · {money(item.totalPaidAmount)} · Đã hoàn tất</option>)}</Select></FormField></> : null}
                    <FormField label={hotelAction === "ESCALATE" ? "Lý do cần EnziuRooms hỗ trợ" : "Nội dung phản hồi"} required><Textarea rows={5} placeholder="Mô tả việc đã kiểm tra, cách giải quyết hoặc thông tin cần bổ sung…" required value={message} onChange={(event) => setMessage(event.target.value)} /></FormField>
                    <EvidenceInput files={files} setFiles={setFiles} /><Button type="submit" loading={busy} disabled={!message.trim() || (hotelAction === "COMPLETE_REQUIRED_ACTION" && !files.length)} startIcon={<Send size={17} />}>Gửi kết quả xử lý</Button></form> : null}
                  {!isTerminal(selected.status) && mode === "hotel" && hotelActions.length === 0 ? <form id="complaint-action" className="complaint-action-panel" onSubmit={submitHotelResponse}><h3>Gửi thêm thông tin cho EnziuRooms</h3>
                    <FormField label="Nội dung phản hồi" required><Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></FormField>
                    <EvidenceInput files={files} setFiles={setFiles} /><Button type="submit" loading={busy} disabled={!message.trim()} startIcon={<Send size={17} />}>Gửi phản hồi</Button></form> : null}
                  {!isTerminal(selected.status) && mode === "admin" && adminActions.length > 0 ? <form id="complaint-action" className="complaint-action-panel admin-decision" onSubmit={submitAdmin}><h3><MessageSquareReply size={20} />Xử lý khiếu nại</h3>
                    <div className="complaint-admin-grid"><FormField label="Quyết định" required><Select value={adminStatus} onChange={(event) => setAdminForm((current) => ({ ...current, status: event.target.value, refundVerified: false }))}>
                      {adminActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
                      <FormField label="Mức độ"><Select value={adminForm.severity} onChange={(event) => setAdminForm((current) => ({ ...current, severity: event.target.value }))}><option value="NORMAL">Thông thường</option><option value="HIGH">Nghiêm trọng</option><option value="CRITICAL">Khẩn cấp</option></Select></FormField></div>
                    {adminStatus === "HOTEL_ACTION_REQUIRED" ? <>
                      <FormField label="Yêu cầu khách sạn thực hiện" required><Select value={adminResolution} onChange={(event) => setAdminForm((current) => ({ ...current, resolutionType: event.target.value, requiredRefundAmount: event.target.value === "FULL_REFUND_ACCEPTED" ? selected.booking?.paidAmount ?? "" : current.requiredRefundAmount }))}>
                        <option value="HOTEL_SUPPORT_REQUIRED">Khắc phục và xử lý cho khách hàng</option><option value="FULL_REFUND_ACCEPTED">Hoàn toàn bộ tiền đã thanh toán</option><option value="PARTIAL_REFUND_ACCEPTED">Hoàn một phần tiền đã thanh toán</option></Select></FormField>
                      {isRefundResolution(adminResolution) ? <FormField label="Số tiền yêu cầu hoàn" required hint={`Khách đã thanh toán ${money(selected.booking?.paidAmount)}`}><input type="number" min="0.01" max={selected.booking?.paidAmount ?? 0} step="0.01" required value={requiredRefundAmount} onChange={(event) => setAdminForm((current) => ({ ...current, requiredRefundAmount: event.target.value }))} /></FormField> : null}
                      <label className="complaint-checkbox"><input type="checkbox" checked={adminForm.violationReviewRecommended ?? selected.violationReviewRecommended ?? false} onChange={(event) => setAdminForm((current) => ({ ...current, violationReviewRecommended: event.target.checked }))} />Ghi nhận khách sạn xử lý không tốt; nêu căn cứ trong quyết định</label>
                    </> : null}
                    {adminStatus === "REJECTED" ? <FormField label="Lý do không chấp nhận khiếu nại" required><Select value={adminResolution} onChange={(event) => setAdminForm((current) => ({ ...current, resolutionType: event.target.value }))}>
                      <option value="REJECTED_CUSTOMER_AT_FAULT">Khách hàng khiếu nại không đúng</option><option value="REJECTED_INSUFFICIENT_EVIDENCE">Không đủ căn cứ sau khi xác minh</option></Select></FormField> : null}
                    {adminStatus === "RESOLVED" && selected.requiredRefundAmount != null && !selected.refundRequestId ? <label className="complaint-checkbox"><input type="checkbox" required checked={adminForm.refundVerified} onChange={(event) => setAdminForm((current) => ({ ...current, refundVerified: event.target.checked }))} />Đã đối chiếu chứng từ và xác minh khách sạn hoàn đủ {money(selected.requiredRefundAmount)}</label> : null}
                    <FormField label="Nội dung gửi cho khách hàng và khách sạn" required><Textarea rows={5} placeholder="Nêu kết quả xem xét, lý do và việc mỗi bên cần thực hiện…" required value={adminForm.note} onChange={(event) => setAdminForm((current) => ({ ...current, note: event.target.value }))} /></FormField>
                    <p className="complaint-muted">Khách hàng và khách sạn đều có thể đọc phản hồi này.</p>
                    {selected.priorViolationEscalationsForHotel > 0 ? <p className="complaint-risk-signal"><ShieldAlert size={17} />Khách sạn đã có {selected.priorViolationEscalationsForHotel} khiếu nại bị ghi nhận xử lý không tốt.</p> : null}
                    <Button type="submit" loading={busy} disabled={!adminForm.note.trim()} startIcon={<CheckCircle2 size={17} />}>Gửi quyết định</Button></form> : null}
                </section>
              ) : null}
            </div>
          )}
    </div>
  );
}

function EvidenceInput({ files, setFiles }) {
  return <div className="complaint-attachments"><label className="complaint-upload"><FileImage size={20} /><span>{files.length ? `${files.length} tệp đã chọn · Chọn lại` : "Chọn ảnh hoặc tài liệu"}</span>
    <input aria-label="Chọn ảnh hoặc tài liệu" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles([...event.target.files].slice(0, 8))} /></label>
    <small className="complaint-muted">Tối đa 8 tệp, 10 MB mỗi tệp. Hỗ trợ JPG, PNG, WEBP và PDF.</small>
    {files.length ? <ul className="complaint-selected-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Paperclip size={14} /><span>{file.name}</span><button type="button" aria-label={`Bỏ tệp ${file.name}`} onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))}><XCircle size={18} /></button></li>)}</ul> : null}
  </div>;
}
