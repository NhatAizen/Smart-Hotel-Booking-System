import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  FileWarning,
  FileText,
  Power,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../components/ui";
import {
  approvePartnerDeactivationRequest,
  approvePartnerRequest,
  getAdminUserDemotionEligibility,
  getPartnerRequestDocument,
  getPartnerRequestEkycEvidence,
  getPartnerRequestSupportingDocument,
  getPartnerRequests,
  getPendingPartnerDeactivationRequests,
  rejectPartnerDeactivationRequest,
  rejectPartnerRequest,
  requestMorePartnerInfo,
} from "../../services/adminService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

import "./PartnerRequestsExperience.css";

const DEACTIVATION_CHECKS = [
  ["currentStayCount", "Khách đang lưu trú"],
  ["actionableBookingCount", "Đặt phòng sắp tới cần xử lý"],
  ["pendingWithdrawalCount", "Yêu cầu rút tiền đang chờ"],
  ["financialIssueCount", "Vấn đề tài chính cần xử lý"],
];

function arrayFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function eligibilityCount(eligibility, key) {
  const value = Number(eligibility?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function blockerText(blocker) {
  const value = typeof blocker === "string"
    ? blocker
    : blocker?.message ?? blocker?.label;
  if (!value || /^[A-Z0-9_]+$/.test(String(value))) {
    return "Một điều kiện nghiệp vụ chưa được đáp ứng";
  }
  return value;
}

function textOrFallback(value, fallback = "Chưa cập nhật") {
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value);
}

function applicantTypeLabel(value) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "BUSINESS") return "Doanh nghiệp";
  if (["PERSONAL", "INDIVIDUAL"].includes(normalized)) return "Cá nhân";
  return "Loại hồ sơ chưa xác định";
}

function partnerStatusLabel(value) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "PENDING") return "Chờ duyệt";
  if (normalized === "NEED_MORE_INFO") return "Cần bổ sung";
  if (normalized === "APPROVED") return "Đã duyệt";
  if (normalized === "REJECTED") return "Từ chối";
  return "Chưa xác định";
}

function partnerName(item) {
  return textOrFallback(
    item?.legalName ?? item?.representativeName ?? item?.fullName ?? item?.userFullName ?? item?.requesterName,
    "Chưa cập nhật tên",
  );
}

function maskIdentityNumber(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "").trim();
  if (!normalized) return "Chưa cập nhật";
  if (normalized.length <= 4) return "••••";
  return `${"•".repeat(Math.min(normalized.length - 4, 8))} ${normalized.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`),
    );
  } catch {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatSimilarity(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : "—";
}

export default function PartnerRequestsPage() {
  const [items, setItems] = useState([]);
  const [reviewFilter, setReviewFilter] = useState("ACTIVE");
  const [deactivationItems, setDeactivationItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [moreInfoTarget, setMoreInfoTarget] = useState(null);
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [documentUrls, setDocumentUrls] = useState({ front: "", back: "" });
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [supportingDocumentUrl, setSupportingDocumentUrl] = useState("");
  const [supportingDocumentError, setSupportingDocumentError] = useState("");
  const [supportingDocumentLoading, setSupportingDocumentLoading] = useState(false);
  const [deactivationReview, setDeactivationReview] = useState(null);
  const [deactivationAction, setDeactivationAction] = useState("approve");
  const [deactivationReason, setDeactivationReason] = useState("");
  const [deactivationEligibility, setDeactivationEligibility] = useState(null);
  const [deactivationEligibilityLoading, setDeactivationEligibilityLoading] = useState(false);
  const [deactivationError, setDeactivationError] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pendingResult, needsInfoResult, approvedResult, rejectedResult, deactivationResult] = await Promise.allSettled([
        getPartnerRequests("PENDING"),
        getPartnerRequests("NEED_MORE_INFO"),
        getPartnerRequests("APPROVED"),
        getPartnerRequests("REJECTED"),
        getPendingPartnerDeactivationRequests(),
      ]);

      setItems(
        [
          ...(pendingResult.status === "fulfilled" ? arrayFrom(pendingResult.value) : []),
          ...(needsInfoResult.status === "fulfilled" ? arrayFrom(needsInfoResult.value) : []),
          ...(approvedResult.status === "fulfilled" ? arrayFrom(approvedResult.value) : []),
          ...(rejectedResult.status === "fulfilled" ? arrayFrom(rejectedResult.value) : []),
        ],
      );
      setDeactivationItems(
        deactivationResult.status === "fulfilled"
          ? arrayFrom(deactivationResult.value)
          : [],
      );

      if (pendingResult.status === "rejected") {
        throw pendingResult.reason;
      }
      if (needsInfoResult.status === "rejected") {
        setError(
          needsInfoResult.reason?.response?.data?.message ??
            "Không thể tải hồ sơ đang chờ bổ sung.",
        );
      }
      if (deactivationResult.status === "rejected") {
        setError(
          deactivationResult.reason?.response?.data?.message ??
            "Không thể tải danh sách yêu cầu ngừng đối tác.",
        );
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          "Không thể tải danh sách yêu cầu đối tác.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const visibleItems = useMemo(() => {
    if (reviewFilter === "ALL") return items;
    if (reviewFilter === "ACTIVE") {
      return items.filter((item) => ["PENDING", "NEED_MORE_INFO"].includes(item.status));
    }
    return items.filter((item) => item.status === reviewFilter);
  }, [items, reviewFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadItems, { debounceMs: 120 });

  useEffect(() => {
    let active = true;
    let frontUrl = "";
    let backUrl = "";

    async function loadDocuments() {
      setDocumentsError("");
      if (!selected?.id || !selected.cccdFrontAvailable || !selected.cccdBackAvailable) {
        setDocumentsLoading(false);
        setDocumentUrls({ front: "", back: "" });
        return;
      }

      setDocumentsLoading(true);
      try {
        const [frontBlob, backBlob] = await Promise.all([
          getPartnerRequestDocument(selected.id, "front"),
          getPartnerRequestDocument(selected.id, "back"),
        ]);

        if (!active) return;

        frontUrl = URL.createObjectURL(frontBlob);
        backUrl = URL.createObjectURL(backBlob);
        setDocumentUrls({ front: frontUrl, back: backUrl });
      } catch (requestError) {
        if (active) {
          setDocumentsError(
            requestError.response?.data?.message ??
              "Không thể tải ảnh CCCD.",
          );
        }
      } finally {
        if (active) setDocumentsLoading(false);
      }
    }

    loadDocuments();

    return () => {
      active = false;
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      if (backUrl) URL.revokeObjectURL(backUrl);
      setDocumentUrls({ front: "", back: "" });
    };
  }, [selected]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function loadSupportingDocument() {
      setSupportingDocumentUrl("");
      setSupportingDocumentError("");
      const documentType = selected?.applicantType === "BUSINESS"
        ? "business-license"
        : "management-proof";
      const available = selected?.applicantType === "BUSINESS"
        ? selected?.businessLicenseAvailable
        : selected?.managementProofAvailable;

      if (!selected?.id || !available) {
        setSupportingDocumentLoading(false);
        return;
      }

      setSupportingDocumentLoading(true);
      try {
        const blob = await getPartnerRequestSupportingDocument(selected.id, documentType);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSupportingDocumentUrl(objectUrl);
      } catch (requestError) {
        if (active) {
          setSupportingDocumentError(
            requestError.response?.data?.message ?? "Không thể tải giấy tờ hồ sơ.",
          );
        }
      } finally {
        if (active) setSupportingDocumentLoading(false);
      }
    }

    void loadSupportingDocument();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSupportingDocumentUrl("");
    };
  }, [selected]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function loadEvidence() {
      setEvidenceError("");
      setEvidenceUrl("");

      if (!selected?.id) {
        setEvidenceLoading(false);
        return;
      }

      if (!selected.ekycEvidenceAvailable) {
        setEvidenceLoading(false);
        setEvidenceError(
          selected.ekycVerified
            ? "Hồ sơ xác minh cũ chưa lưu ảnh camera thành công. Yêu cầu người dùng quét lại trước khi phê duyệt."
            : "Chưa có ảnh bằng chứng xác minh danh tính.",
        );
        return;
      }

      setEvidenceLoading(true);
      try {
        const blob = await getPartnerRequestEkycEvidence(selected.id);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setEvidenceUrl(objectUrl);
      } catch (requestError) {
        if (active) {
          setEvidenceError(
            requestError.response?.data?.message ??
              "Không thể tải ảnh xác minh khuôn mặt.",
          );
        }
      } finally {
        if (active) setEvidenceLoading(false);
      }
    }

    loadEvidence();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setEvidenceUrl("");
    };
  }, [selected]);

  function requestApprove(item) {
    if (busyId) return;
    if (!item.ocrVerified || !item.ekycVerified) {
      setError(
        "Hồ sơ chưa hoàn tất kiểm tra giấy tờ, người thật và đối chiếu khuôn mặt nên chưa thể phê duyệt.",
      );
      return;
    }
    if (!item.ekycEvidenceAvailable) {
      setError(
        "Hồ sơ chưa có ảnh camera xác minh để đối chiếu. Hãy yêu cầu người dùng quét lại khuôn mặt trước khi phê duyệt.",
      );
      return;
    }
    if (!item.contactEmail) {
      setError("Hồ sơ chưa có email liên hệ. Hãy yêu cầu khách hàng bổ sung trước khi duyệt.");
      return;
    }
    if (item.applicantType === "BUSINESS" && !item.businessLicenseAvailable) {
      setError("Hồ sơ doanh nghiệp chưa có giấy chứng nhận đăng ký.");
      return;
    }
    setError("");
    setApprovalTarget(item);
  }

  async function confirmApprove() {
    const item = approvalTarget;
    if (!item || busyId) return;

    setBusyId(item.id);
    setError("");
    try {
      await approvePartnerRequest(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSelected(null);
      setApprovalTarget(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Duyệt hồ sơ thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do từ chối.");
      return;
    }
    setBusyId(rejecting.id);
    try {
      await rejectPartnerRequest(rejecting.id, reason.trim());
      setItems((current) => current.filter((item) => item.id !== rejecting.id));
      setRejecting(null);
      setReason("");
      setSelected(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Từ chối hồ sơ thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestMoreInfo() {
    if (!reason.trim()) {
      setError("Vui lòng nhập nội dung cần bổ sung.");
      return;
    }
    setBusyId(moreInfoTarget.id);
    try {
      const updated = await requestMorePartnerInfo(moreInfoTarget.id, reason.trim());
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMoreInfoTarget(null);
      setReason("");
      setSelected(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể gửi yêu cầu bổ sung.");
    } finally {
      setBusyId(null);
    }
  }

  async function loadDeactivationEligibility(item = deactivationReview) {
    const userId = item?.userId ?? item?.accountId;
    if (!userId) {
      setDeactivationError("Yêu cầu không có mã tài khoản để kiểm tra điều kiện.");
      return null;
    }

    setDeactivationEligibilityLoading(true);
    setDeactivationError("");
    try {
      const payload = await getAdminUserDemotionEligibility(userId);
      setDeactivationEligibility(payload);
      return payload;
    } catch (requestError) {
      setDeactivationEligibility(null);
      setDeactivationError(
        requestError.response?.data?.message ??
          "Không thể kiểm tra điều kiện chuyển tài khoản về khách hàng.",
      );
      return null;
    } finally {
      setDeactivationEligibilityLoading(false);
    }
  }

  function openDeactivationReview(item, action) {
    setDeactivationReview(item);
    setDeactivationAction(action);
    setDeactivationReason("");
    setDeactivationEligibility(null);
    setDeactivationError("");
    if (action === "approve") {
      void loadDeactivationEligibility(item);
    }
  }

  function closeDeactivationReview() {
    if (busyId) return;
    setDeactivationReview(null);
    setDeactivationReason("");
    setDeactivationEligibility(null);
    setDeactivationError("");
  }

  async function handleDeactivationReview() {
    const item = deactivationReview;
    const normalizedReason = deactivationReason.trim();
    if (!item?.id) return;
    if (!normalizedReason) {
      setDeactivationError("Vui lòng nhập lý do xử lý để lưu trong lịch sử quản trị.");
      return;
    }
    if (deactivationAction === "approve" && !deactivationEligibility?.eligible) {
      setDeactivationError("Tài khoản chưa đáp ứng đủ điều kiện để chuyển về khách hàng.");
      return;
    }

    setBusyId(item.id);
    setDeactivationError("");
    try {
      if (deactivationAction === "approve") {
        await approvePartnerDeactivationRequest(item.id, normalizedReason);
      } else {
        await rejectPartnerDeactivationRequest(item.id, normalizedReason);
      }
      setDeactivationItems((current) =>
        current.filter((row) => String(row.id) !== String(item.id)),
      );
      setDeactivationReview(null);
      setDeactivationReason("");
      setDeactivationEligibility(null);
    } catch (requestError) {
      const message = requestError.response?.data?.message ??
        "Không thể xử lý yêu cầu ngừng làm đối tác.";
      if (
        deactivationAction === "approve" &&
        requestError.response?.status === 409
      ) {
        await loadDeactivationEligibility(item);
      }
      setDeactivationError(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page admin-partner-requests-page">
      <PageHeader
        className="admin-partner-page-header"
        eyebrow="Kiểm duyệt đối tác"
        title="Yêu cầu đối tác"
        description="Duyệt hồ sơ đăng ký và yêu cầu ngừng làm đối tác trên EnziuRooms."
        actions={(
          <button type="button" className="admin-secondary-button" onClick={loadItems} disabled={loading}>
            <RefreshCw size={18} className={loading ? "admin-spin-icon" : ""} /> Làm mới
          </button>
        )}
      />

      <ErrorState
        className="admin-partner-page-error"
        message={error}
        onRetry={loadItems}
        compact
      />

      <div className="admin-partner-section-heading">
        <div>
          <span>ĐĂNG KÝ ĐỐI TÁC</span>
          <h2>Hồ sơ đăng ký đối tác</h2>
          <p>Kiểm tra thông tin CCCD và kết quả xác minh trước khi duyệt.</p>
        </div>
        <strong>{visibleItems.length}</strong>
      </div>

      <div className="admin-partner-status-filters" role="group" aria-label="Lọc trạng thái hồ sơ">
        {[
          ["ACTIVE", "Cần xử lý"],
          ["PENDING", "Chờ duyệt"],
          ["NEED_MORE_INFO", "Cần bổ sung"],
          ["APPROVED", "Đã duyệt"],
          ["REJECTED", "Từ chối"],
          ["ALL", "Tất cả"],
        ].map(([value, label]) => (
          <button type="button" className={reviewFilter === value ? "active" : ""} onClick={() => setReviewFilter(value)} key={value}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Đang tải hồ sơ đối tác..." />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={<BadgeCheck size={42} />}
          title="Không có yêu cầu đối tác chờ duyệt"
          description="Tất cả hồ sơ hiện đã được xử lý."
        />
      ) : (
        <div className="admin-card-list">
          {visibleItems.map((item) => (
            <article key={item.id} className="admin-review-card">
              <div className="admin-review-main">
                <div className="admin-review-icon">
                  {item.applicantType === "BUSINESS" ? (
                    <BriefcaseBusiness size={25} />
                  ) : (
                    <UserRound size={25} />
                  )}
                </div>
                <div>
                  <div className="admin-review-title-row">
                    <h2>{partnerName(item)}</h2>
                    {item.status === "APPROVED" ? (
                      <StatusBadge status="APPROVED" label="Đã duyệt" icon={<BadgeCheck size={13} />} size="sm" />
                    ) : item.status === "REJECTED" ? (
                      <StatusBadge status="REJECTED" label="Từ chối" icon={<XCircle size={13} />} size="sm" />
                    ) : item.status === "NEED_MORE_INFO" ? (
                      <StatusBadge
                        status="PENDING"
                        label="Đang chờ bổ sung"
                        icon={<Clock3 size={13} />}
                        size="sm"
                      />
                    ) : item.ekycVerified ? (
                      <StatusBadge
                        status="APPROVED"
                        label="Danh tính đã xác minh"
                        icon={<ShieldCheck size={13} />}
                        size="sm"
                      />
                    ) : (
                      <StatusBadge
                        status="PENDING"
                        label="Chưa hoàn tất xác minh"
                        icon={<FileWarning size={13} />}
                        size="sm"
                      />
                    )}
                  </div>
                  <p>{applicantTypeLabel(item.applicantType)}</p>
                  <div className="admin-review-meta">
                    <span>CCCD: <strong aria-label="Số căn cước đã được che bớt">{maskIdentityNumber(item.identityNumber)}</strong></span>
                    <span>Đại diện: <strong>{textOrFallback(item.representativeName ?? item.legalName, "Chưa cập nhật tên")}</strong></span>
                    <span>Độ tương đồng khuôn mặt: <strong>{formatSimilarity(item.faceSimilarity)}</strong></span>
                    <span>Ảnh xác minh: <strong>{item.ekycEvidenceAvailable ? "Đã có" : "Còn thiếu"}</strong></span>
                    <span>Giấy tờ hồ sơ: <strong>{item.applicantType === "BUSINESS"
                      ? item.businessLicenseAvailable ? "Đã có" : "Còn thiếu"
                      : item.managementProofAvailable ? "Đã có" : "Không cung cấp"}</strong></span>
                  </div>
                </div>
              </div>

              <div className="admin-card-actions">
                <button type="button" className="admin-detail-button" onClick={() => setSelected(item)} aria-label={`Xem chi tiết hồ sơ ${partnerName(item)}`}>
                  <Eye size={17} /> Chi tiết
                </button>
                {item.status === "PENDING" ? <>
                  <button type="button" className="admin-more-info-button" onClick={() => { setMoreInfoTarget(item); setReason(""); }}>
                    <FileText size={17} /> Yêu cầu bổ sung
                  </button>
                  <button type="button" className="admin-reject-button" onClick={() => { setRejecting(item); setReason(""); }}>
                    <XCircle size={17} /> Từ chối
                  </button>
                  <button
                    type="button"
                    className="admin-approve-button"
                    onClick={() => requestApprove(item)}
                    disabled={
                      busyId === item.id ||
                      !item.ocrVerified ||
                      !item.ekycVerified ||
                      !item.ekycEvidenceAvailable ||
                      !item.contactEmail ||
                      (item.applicantType === "BUSINESS" && !item.businessLicenseAvailable)
                    }
                  >
                    <BadgeCheck size={17} /> {busyId === item.id ? "Đang xử lý..." : "Phê duyệt"}
                  </button>
                </> : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading ? (
        <section className="admin-partner-deactivation-section">
          <div className="admin-partner-section-heading">
            <div>
              <span>NGỪNG ĐỐI TÁC</span>
              <h2>Yêu cầu ngừng làm đối tác</h2>
              <p>Kiểm tra lại toàn bộ điều kiện vận hành và tài chính trước khi duyệt.</p>
            </div>
            <strong>{deactivationItems.length}</strong>
          </div>

          {deactivationItems.length === 0 ? (
            <EmptyState
              className="admin-partner-empty"
              compact
              icon={<CheckCircle2 size={34} />}
              title="Không có yêu cầu ngừng đối tác chờ duyệt"
              description="Tất cả yêu cầu hiện đã được xử lý."
            />
          ) : (
            <div className="admin-card-list">
              {deactivationItems.map((item) => {
                const fullName = partnerName(item);
                const email = item.email ?? item.userEmail ?? "—";
                return (
                  <article key={item.id} className="admin-review-card admin-deactivation-card">
                    <div className="admin-review-main">
                      <div className="admin-review-icon deactivation">
                        <Power size={24} />
                      </div>
                      <div>
                        <div className="admin-review-title-row">
                          <h2>{fullName}</h2>
                          <StatusBadge status="PENDING" label="Chờ xác nhận" icon={<Clock3 size={13} />} size="sm" />
                        </div>
                        <p>{email}</p>
                        <div className="admin-review-meta">
                          <span>Gửi lúc: <strong>{formatDateTime(item.requestedAt ?? item.createdAt)}</strong></span>
                          <span>Lý do: <strong>{textOrFallback(item.reason, "Người gửi không cung cấp")}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-card-actions">
                      <button
                        type="button"
                        className="admin-reject-button"
                        onClick={() => openDeactivationReview(item, "reject")}
                      >
                        <XCircle size={17} /> Từ chối
                      </button>
                      <button
                        type="button"
                        className="admin-approve-button"
                        onClick={() => openDeactivationReview(item, "approve")}
                      >
                        <Building2 size={17} /> Chuyển về khách hàng
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(approvalTarget)}
        title="Phê duyệt đối tác khách sạn"
        description={approvalTarget ? `${partnerName(approvalTarget)} sẽ được chuyển sang vai trò đối tác khách sạn.` : undefined}
        confirmLabel="Xác nhận phê duyệt"
        confirmTone="primary"
        busy={Boolean(approvalTarget && busyId === approvalTarget.id)}
        onCancel={() => {
          if (!busyId) {
            setApprovalTarget(null);
            setError("");
          }
        }}
        onConfirm={() => void confirmApprove()}
      >
        {approvalTarget && error ? <p className="admin-partner-confirm-error" role="alert">{error}</p> : null}
        <div className="admin-partner-approval-checklist">
          <p><ShieldCheck size={18} /> CCCD và thông tin khai báo đã được đối chiếu.</p>
          <p><Camera size={18} /> Ảnh camera xác minh đã có để kiểm tra khuôn mặt.</p>
          <p><BadgeCheck size={18} /> Phê duyệt sẽ cấp quyền vận hành khách sạn cho tài khoản này.</p>
        </div>
      </ConfirmDialog>

      {selected ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="admin-modal partner-review-modal" role="dialog" aria-modal="true" aria-labelledby="partner-review-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div><span>CHI TIẾT HỒ SƠ VÀ XÁC MINH DANH TÍNH</span><h2 id="partner-review-title">{partnerName(selected)}</h2></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Đóng chi tiết hồ sơ">×</button>
            </div>

            <div className={`partner-admin-ocr-status ${selected.ocrVerified ? "verified" : "failed"}`}>
              {selected.ocrVerified ? <ScanLine size={22} /> : <FileWarning size={22} />}
              <div>
                <strong>{selected.ocrVerified ? "Thông tin trên CCCD đã được xác minh" : "Thông tin trên CCCD chưa hợp lệ"}</strong>
                <small>{selected.ocrVerified ? "Số CCCD, họ tên và ngày sinh khớp với thông tin đã khai." : "Hồ sơ không được phép phê duyệt."}</small>
              </div>
            </div>

            <div className={`partner-admin-ocr-status ${selected.ekycVerified ? "verified" : "failed"}`}>
              {selected.ekycVerified ? <ShieldCheck size={22} /> : <FileWarning size={22} />}
              <div>
                <strong>{selected.ekycVerified ? "Xác minh danh tính đã hoàn tất" : "Xác minh danh tính chưa hoàn tất"}</strong>
                <small>
                  Kiểm tra trực tiếp: {selected.livenessVerified ? "Đạt" : "Chưa đạt"} · Đối chiếu khuôn mặt: {selected.faceVerified ? "Khớp" : "Chưa khớp"} · Mức khớp: {formatSimilarity(selected.faceSimilarity)} · Ảnh xác minh: {selected.ekycEvidenceAvailable ? "Đã có" : "Chưa có"}
                </small>
              </div>
            </div>

            <div className="partner-admin-identity-compare">
              <div className="partner-admin-documents-heading">
                <span>ĐỐI CHIẾU DANH TÍNH</span>
                <small>Ảnh chụp trong bước xác minh được dùng để đối chiếu với ảnh trên CCCD.</small>
              </div>

              <div className="partner-admin-compare-status">
                <ShieldCheck size={18} />
                <div>
                  <strong>Kiểm tra thủ công trước khi duyệt</strong>
                  <small>So sánh ảnh chân dung trên CCCD với ảnh chụp trong bước xác minh bên dưới.</small>
                </div>
              </div>

              {documentsLoading || evidenceLoading ? (
                <div className="partner-admin-doc-loading"><LoadingState message="Đang tải ảnh đối chiếu..." /></div>
              ) : evidenceError ? (
                <div className="partner-admin-evidence-warning">
                  <AlertTriangle size={18} />
                  <span>{evidenceError}</span>
                </div>
              ) : documentUrls.front && evidenceUrl ? (
                <div className="partner-admin-compare-grid">
                  <figure>
                    <div className="partner-admin-compare-image">
                      <img src={documentUrls.front} alt="CCCD mặt trước để đối chiếu danh tính" />
                    </div>
                    <figcaption>
                      <ScanLine size={16} />
                      <span><strong>Ảnh CCCD mặt trước</strong><small>Ảnh từ hồ sơ xác minh</small></span>
                    </figcaption>
                  </figure>
                  <figure className="verified-evidence">
                    <div className="partner-admin-compare-image">
                      <img src={evidenceUrl} alt="Ảnh camera lúc xác minh danh tính thành công" />
                      <span className="partner-admin-evidence-badge"><CheckCircle2 size={14} /> Đã xác minh</span>
                    </div>
                    <figcaption>
                      <Camera size={16} />
                      <span><strong>Ảnh camera khi xác minh thành công</strong><small>{formatDateTime(selected.ekycProcessedAt)}</small></span>
                    </figcaption>
                  </figure>
                </div>
              ) : (
                <div className="partner-admin-evidence-warning">
                  <AlertTriangle size={18} />
                  <span>Chưa đủ ảnh CCCD hoặc ảnh camera xác minh để đối chiếu.</span>
                </div>
              )}

              <div className="partner-admin-evidence-metrics">
                <div><span>Kiểm tra người thật</span><strong className={selected.livenessVerified ? "pass" : "fail"}>{selected.livenessVerified ? "Đạt" : "Chưa đạt"}</strong></div>
                <div><span>Đối chiếu khuôn mặt</span><strong className={selected.faceVerified ? "pass" : "fail"}>{selected.faceVerified ? "Đạt" : "Chưa đạt"}</strong></div>
                <div><span>Chỉ số tương đồng khuôn mặt</span><strong>{formatSimilarity(selected.faceSimilarity)}</strong></div>
                <div><span>Thời điểm xác minh</span><strong>{formatDateTime(selected.ekycProcessedAt)}</strong></div>
              </div>
            </div>

            <div className="admin-detail-grid">
              <div><span>Loại hồ sơ</span><strong>{applicantTypeLabel(selected.applicantType)}</strong></div>
              <div><span>Số CCCD khai báo</span><strong>{textOrFallback(selected.identityNumber)}</strong></div>
              <div><span>Chủ hồ sơ / Người đại diện</span><strong>{textOrFallback(selected.representativeName ?? selected.legalName, "Chưa cập nhật tên")}</strong></div>
              <div><span>Ngày sinh khai báo</span><strong>{formatDate(selected.dateOfBirth)}</strong></div>
              <div><span>Số CCCD trích xuất</span><strong>{textOrFallback(selected.ocrIdentityNumber)}</strong></div>
              <div><span>Ngày sinh trích xuất</span><strong>{formatDate(selected.ocrDateOfBirth)}</strong></div>
              <div><span>Họ tên trích xuất</span><strong>{textOrFallback(selected.ocrFullName)}</strong></div>
              <div><span>Kết quả đối chiếu giấy tờ</span><strong>{selected.ocrIdentityMatched && selected.ocrNameMatched && selected.ocrDateOfBirthMatched ? "Khớp toàn bộ" : "Chưa khớp"}</strong></div>
              <div><span>Kiểm tra người thật</span><strong>{selected.livenessVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><span>Đối chiếu khuôn mặt</span><strong>{selected.faceVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><span>Độ tương đồng khuôn mặt</span><strong>{formatSimilarity(selected.faceSimilarity)}</strong></div>
              <div><span>Thời điểm xác minh danh tính</span><strong>{formatDateTime(selected.ekycProcessedAt)}</strong></div>
              <div><span>Số điện thoại</span><strong>{textOrFallback(selected.businessPhone)}</strong></div>
              <div><span>Email</span><strong>{textOrFallback(selected.contactEmail)}</strong></div>
              {selected.applicantType === "BUSINESS" ? <div><span>Mã số thuế</span><strong>{textOrFallback(selected.businessTaxCode)}</strong></div> : null}
              <div><span>{selected.applicantType === "BUSINESS" ? "Địa chỉ trụ sở" : "Địa chỉ liên hệ"}</span><strong>{textOrFallback(selected.businessAddress)}</strong></div>
              <div><span>Thời gian gửi</span><strong>{formatDateTime(selected.createdAt)}</strong></div>
              <div><span>Trạng thái</span><strong>{partnerStatusLabel(selected.status)}</strong></div>
              {selected.rejectionReason ? <div className="wide"><span>{selected.status === "REJECTED" ? "Lý do từ chối" : "Nội dung đã yêu cầu bổ sung"}</span><strong>{selected.rejectionReason}</strong></div> : null}
              <div className="wide"><span>Ghi chú</span><strong>{textOrFallback(selected.note, "Không có ghi chú")}</strong></div>
            </div>

            <div className="partner-admin-documents partner-admin-supporting-document">
              <div className="partner-admin-documents-heading">
                <span>{selected.applicantType === "BUSINESS" ? "GIẤY CHỨNG NHẬN ĐĂNG KÝ" : "TÀI LIỆU QUYỀN QUẢN LÝ"}</span>
                <small>{selected.applicantType === "BUSINESS" ? "Bắt buộc với doanh nghiệp / hộ kinh doanh." : "Tài liệu tùy chọn của hồ sơ cá nhân."}</small>
              </div>
              {supportingDocumentLoading ? (
                <div className="partner-admin-doc-loading"><LoadingState message="Đang tải giấy tờ..." /></div>
              ) : supportingDocumentError ? (
                <div className="partner-admin-doc-error">{supportingDocumentError}</div>
              ) : supportingDocumentUrl ? (
                <div className="partner-admin-file-row">
                  <FileText size={22} />
                  <span>
                    <strong>{selected.applicantType === "BUSINESS" ? selected.businessLicenseName : selected.managementProofName}</strong>
                    <small>{selected.applicantType === "BUSINESS" ? selected.businessLicenseContentType : selected.managementProofContentType}</small>
                  </span>
                  <a href={supportingDocumentUrl} target="_blank" rel="noreferrer">Xem tài liệu</a>
                </div>
              ) : (
                <div className="partner-admin-doc-empty">
                  {selected.applicantType === "BUSINESS" ? "Chưa có giấy chứng nhận đăng ký." : "Người đăng ký không cung cấp tài liệu tùy chọn."}
                </div>
              )}
            </div>

            <div className="partner-admin-documents">
              <div className="partner-admin-documents-heading">
                <span>ẢNH CCCD BẢO MẬT</span>
                <small>Ảnh CCCD và ảnh xác minh chỉ hiển thị trong màn hình xét duyệt này.</small>
              </div>
              {documentsLoading ? (
                <div className="partner-admin-doc-loading"><LoadingState message="Đang tải ảnh CCCD..." /></div>
              ) : documentsError ? (
                <div className="partner-admin-doc-error">{documentsError}</div>
              ) : documentUrls.front && documentUrls.back ? (
                <div className="partner-admin-doc-grid">
                  <figure><img src={documentUrls.front} alt="CCCD mặt trước" /><figcaption>Mặt trước</figcaption></figure>
                  <figure><img src={documentUrls.back} alt="CCCD mặt sau" /><figcaption>Mặt sau</figcaption></figure>
                </div>
              ) : (
                <div className="partner-admin-doc-error">Hồ sơ cũ chưa có ảnh CCCD để đối chiếu.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {moreInfoTarget ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setMoreInfoTarget(null)}>
          <section className="admin-modal small" role="dialog" aria-modal="true" aria-labelledby="partner-more-info-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div><span>YÊU CẦU BỔ SUNG</span><h2 id="partner-more-info-title">{partnerName(moreInfoTarget)}</h2></div>
              <button type="button" onClick={() => setMoreInfoTarget(null)} aria-label="Đóng hộp thoại yêu cầu bổ sung">×</button>
            </div>
            <label className="admin-form-field">
              <span>Nội dung cần bổ sung *</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} maxLength={500} placeholder="Nêu rõ thông tin hoặc giấy tờ cần bổ sung..." />
            </label>
            <div className="admin-modal-actions">
              <button type="button" className="admin-cancel-button" onClick={() => setMoreInfoTarget(null)}>Hủy</button>
              <button type="button" className="admin-more-info-button" onClick={handleRequestMoreInfo} disabled={busyId === moreInfoTarget.id || !reason.trim()}>
                {busyId === moreInfoTarget.id ? "Đang gửi..." : "Gửi yêu cầu bổ sung"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {rejecting ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setRejecting(null)}>
          <section className="admin-modal small" role="dialog" aria-modal="true" aria-labelledby="partner-reject-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header"><div><span>TỪ CHỐI HỒ SƠ</span><h2 id="partner-reject-title">{partnerName(rejecting)}</h2></div><button type="button" onClick={() => setRejecting(null)} aria-label="Đóng hộp thoại từ chối">×</button></div>
            <label className="admin-form-field">
              <span>Lý do từ chối</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Ví dụ: Ảnh CCCD bị lóa, khuôn mặt chưa đối chiếu được hoặc thông tin cần bổ sung..." />
            </label>
            <div className="admin-modal-actions">
              <button type="button" className="admin-cancel-button" onClick={() => setRejecting(null)}>Hủy</button>
              <button type="button" className="admin-reject-button" onClick={handleReject} disabled={busyId === rejecting.id}>{busyId === rejecting.id ? "Đang xử lý..." : "Xác nhận từ chối"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {deactivationReview ? (
        <div
          className="admin-modal-layer admin-confirm-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeactivationReview();
          }}
        >
          <section
            className="admin-modal small admin-deactivation-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-deactivation-review-title"
          >
            <div className="admin-modal-header">
              <div>
                <span>NGỪNG LÀM ĐỐI TÁC</span>
                <h2 id="admin-deactivation-review-title">
                  {deactivationAction === "approve"
                    ? "Chuyển về khách hàng"
                    : "Từ chối yêu cầu"}
                </h2>
              </div>
              <button
                type="button"
                disabled={busyId === deactivationReview.id}
                onClick={closeDeactivationReview}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="admin-deactivation-request-summary">
              <Power size={21} />
              <div>
                <strong>
                  {deactivationReview.fullName ??
                    deactivationReview.userFullName ??
                    deactivationReview.requesterName ??
                    "Chưa cập nhật tên"}
                </strong>
                <small>{deactivationReview.email ?? deactivationReview.userEmail ?? "—"}</small>
                <p>{deactivationReview.reason || "Không có lý do từ người gửi."}</p>
              </div>
            </div>

            {deactivationError ? (
              <div className="admin-role-change-error" role="alert">
                <AlertTriangle size={18} />
                <span>{deactivationError}</span>
              </div>
            ) : null}

            {deactivationAction === "approve" ? (
              deactivationEligibilityLoading ? (
                <div className="admin-role-eligibility-loading">
                  <span className="admin-spinner" /> Đang kiểm tra điều kiện mới nhất...
                </div>
              ) : deactivationEligibility ? (
                <div className="role-eligibility-list">
                  {DEACTIVATION_CHECKS.map(([key, label]) => {
                    const count = eligibilityCount(deactivationEligibility, key);
                    const clear = count === 0;
                    return (
                      <div className={clear ? "clear" : "blocked"} key={key}>
                        {clear ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span>
                          <strong>{label}</strong>
                          <small>{clear ? "Đã xử lý xong" : `${count} mục còn tồn tại`}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null
            ) : (
              <div className="admin-role-change-note reject">
                <AlertTriangle size={20} />
                <p>Tài khoản đối tác vẫn hoạt động khi yêu cầu bị từ chối.</p>
              </div>
            )}

            {deactivationAction === "approve" &&
            !deactivationEligibility?.eligible &&
            Array.isArray(deactivationEligibility?.blockers) &&
            deactivationEligibility.blockers.length > 0 ? (
              <ul className="role-eligibility-blockers">
                {deactivationEligibility.blockers.map((blocker, index) => (
                  <li key={`${blockerText(blocker)}-${index}`}>{blockerText(blocker)}</li>
                ))}
              </ul>
            ) : null}

            <label className="admin-form-field">
              <span>
                {deactivationAction === "approve" ? "Lý do phê duyệt" : "Lý do từ chối"} *
              </span>
              <textarea
                rows={4}
                maxLength={500}
                value={deactivationReason}
                onChange={(event) => {
                  setDeactivationReason(event.target.value);
                  setDeactivationError("");
                }}
                placeholder="Nhập lý do để lưu trong lịch sử quản trị..."
              />
            </label>

            <div className="admin-modal-actions">
              {deactivationAction === "approve" ? (
                <button
                  type="button"
                  className="admin-secondary-button"
                  disabled={deactivationEligibilityLoading || busyId === deactivationReview.id}
                  onClick={() => void loadDeactivationEligibility()}
                >
                  <RefreshCw size={16} /> Kiểm tra lại
                </button>
              ) : null}
              <button
                type="button"
                className="admin-cancel-button"
                disabled={busyId === deactivationReview.id}
                onClick={closeDeactivationReview}
              >
                Hủy
              </button>
              <button
                type="button"
                className={deactivationAction === "approve" ? "admin-approve-button" : "admin-reject-button"}
                disabled={
                  busyId === deactivationReview.id ||
                  deactivationEligibilityLoading ||
                  !deactivationReason.trim() ||
                  (deactivationAction === "approve" && !deactivationEligibility?.eligible)
                }
                onClick={() => void handleDeactivationReview()}
              >
                {busyId === deactivationReview.id
                  ? "Đang xử lý..."
                  : deactivationAction === "approve"
                    ? "Xác nhận chuyển về khách hàng"
                    : "Xác nhận từ chối"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
