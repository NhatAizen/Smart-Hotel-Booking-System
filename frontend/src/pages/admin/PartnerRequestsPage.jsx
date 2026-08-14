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
  Power,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  approvePartnerDeactivationRequest,
  approvePartnerRequest,
  getAdminUserDemotionEligibility,
  getPartnerRequestDocument,
  getPartnerRequestEkycEvidence,
  getPendingPartnerDeactivationRequests,
  getPendingPartnerRequests,
  rejectPartnerDeactivationRequest,
  rejectPartnerRequest,
} from "../../services/adminService";

const DEACTIVATION_CHECKS = [
  ["currentStayCount", "Khách đang lưu trú"],
  ["actionableBookingCount", "Booking sắp tới cần xử lý"],
  ["pendingWithdrawalCount", "Withdrawal đang chờ"],
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
  if (typeof blocker === "string") return blocker;
  return blocker?.message ?? blocker?.label ?? blocker?.code ?? "Điều kiện chưa đáp ứng";
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
  const [deactivationItems, setDeactivationItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [documentUrls, setDocumentUrls] = useState({ front: "", back: "" });
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
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
      const [partnerResult, deactivationResult] = await Promise.allSettled([
        getPendingPartnerRequests(),
        getPendingPartnerDeactivationRequests(),
      ]);

      setItems(
        partnerResult.status === "fulfilled"
          ? arrayFrom(partnerResult.value)
          : [],
      );
      setDeactivationItems(
        deactivationResult.status === "fulfilled"
          ? arrayFrom(deactivationResult.value)
          : [],
      );

      if (partnerResult.status === "rejected") {
        throw partnerResult.reason;
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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

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
              "Không thể tải ảnh CCCD private.",
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
            ? "Hồ sơ eKYC cũ chưa lưu ảnh camera thành công. Yêu cầu người dùng quét lại trước khi phê duyệt."
            : "Chưa có ảnh bằng chứng eKYC.",
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
              "Không thể tải ảnh camera eKYC private.",
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

  async function handleApprove(item) {
    if (!item.ocrVerified || !item.ekycVerified) {
      setError(
        "Hồ sơ chưa vượt qua đầy đủ OCR + liveness + face match. Không thể phê duyệt.",
      );
      return;
    }
    if (!item.ekycEvidenceAvailable) {
      setError(
        "Hồ sơ chưa có ảnh bằng chứng camera eKYC để đối chiếu. Hãy yêu cầu người dùng quét lại khuôn mặt trước khi phê duyệt.",
      );
      return;
    }
    if (
      !window.confirm(
        "Bạn đã đối chiếu ảnh CCCD với ảnh camera eKYC thành công? Phê duyệt sẽ nâng tài khoản thành HOTEL_ADMIN.",
      )
    ) {
      return;
    }
    setBusyId(item.id);
    try {
      await approvePartnerRequest(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSelected(null);
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
          "Không thể kiểm tra điều kiện chuyển tài khoản về Customer.",
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
      setDeactivationError("Vui lòng nhập lý do xử lý để ghi audit log.");
      return;
    }
    if (deactivationAction === "approve" && !deactivationEligibility?.eligible) {
      setDeactivationError("Tài khoản chưa đáp ứng đủ điều kiện để chuyển về Customer.");
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
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">PARTNER REQUESTS</span>
          <h1>Yêu cầu đối tác</h1>
          <p>
            Duyệt hồ sơ trở thành đối tác và yêu cầu ngừng đối tác trên EnziuRooms.
          </p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={loadItems}>
          <RefreshCw size={18} /> Làm mới
        </button>
      </div>

      <ErrorMessage message={error} onRetry={loadItems} />

      <div className="admin-partner-section-heading">
        <div>
          <span>ĐĂNG KÝ ĐỐI TÁC</span>
          <h2>Yêu cầu trở thành Hotel Admin</h2>
          <p>Kiểm tra OCR, eKYC và ảnh CCCD private trước khi cấp quyền.</p>
        </div>
        <strong>{items.length}</strong>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <BadgeCheck size={48} />
          <strong>Không có yêu cầu đối tác chờ duyệt</strong>
          <span>Tất cả hồ sơ hiện đã được xử lý.</span>
        </div>
      ) : (
        <div className="admin-card-list">
          {items.map((item) => (
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
                    <h2>{item.legalName}</h2>
                    {item.ekycVerified ? (
                      <span className="admin-status approved">
                        <ShieldCheck size={13} /> eKYC hợp lệ
                      </span>
                    ) : (
                      <span className="admin-status rejected">
                        <FileWarning size={13} /> Chưa eKYC
                      </span>
                    )}
                  </div>
                  <p>{item.applicantType === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân"}</p>
                  <div className="admin-review-meta">
                    <span>CCCD: <strong>{item.identityNumber}</strong></span>
                    <span>Đại diện: <strong>{item.representativeName || item.legalName}</strong></span>
                    <span>Face similarity: <strong>{formatSimilarity(item.faceSimilarity)}</strong></span>
                    <span>Ảnh eKYC: <strong>{item.ekycEvidenceAvailable ? "Có bằng chứng" : "Thiếu"}</strong></span>
                  </div>
                </div>
              </div>

              <div className="admin-card-actions">
                <button type="button" className="admin-detail-button" onClick={() => setSelected(item)}>
                  <Eye size={17} /> Chi tiết
                </button>
                <button type="button" className="admin-reject-button" onClick={() => setRejecting(item)}>
                  <XCircle size={17} /> Từ chối
                </button>
                <button
                  type="button"
                  className="admin-approve-button"
                  onClick={() => handleApprove(item)}
                  disabled={
                    busyId === item.id ||
                    !item.ocrVerified ||
                    !item.ekycVerified ||
                    !item.ekycEvidenceAvailable
                  }
                >
                  <BadgeCheck size={17} /> {busyId === item.id ? "Đang xử lý..." : "Phê duyệt"}
                </button>
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
              <h2>Yêu cầu chuyển về Customer</h2>
              <p>Kiểm tra lại toàn bộ điều kiện vận hành và tài chính trước khi duyệt.</p>
            </div>
            <strong>{deactivationItems.length}</strong>
          </div>

          {deactivationItems.length === 0 ? (
            <div className="admin-empty-state compact admin-partner-empty">
              <CheckCircle2 size={38} />
              <strong>Không có yêu cầu ngừng đối tác chờ duyệt</strong>
              <span>Tất cả yêu cầu hiện đã được xử lý.</span>
            </div>
          ) : (
            <div className="admin-card-list">
              {deactivationItems.map((item) => {
                const fullName = item.fullName ?? item.userFullName ?? item.requesterName ?? "Hotel Admin";
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
                          <span className="admin-status pending">
                            <Clock3 size={13} /> Chờ xác nhận
                          </span>
                        </div>
                        <p>{email}</p>
                        <div className="admin-review-meta">
                          <span>Gửi lúc: <strong>{formatDateTime(item.requestedAt ?? item.createdAt)}</strong></span>
                          <span>Lý do: <strong>{item.reason || "Không có"}</strong></span>
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
                        <Building2 size={17} /> Chuyển về Customer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {selected ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="admin-modal partner-review-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div><span>CHI TIẾT HỒ SƠ + eKYC</span><h2>{selected.legalName}</h2></div>
              <button type="button" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className={`partner-admin-ocr-status ${selected.ocrVerified ? "verified" : "failed"}`}>
              {selected.ocrVerified ? <ScanLine size={22} /> : <FileWarning size={22} />}
              <div>
                <strong>{selected.ocrVerified ? "OCR CCCD đã xác minh" : "OCR CCCD chưa hợp lệ"}</strong>
                <small>{selected.ocrVerified ? "Số CCCD, họ tên và ngày sinh khớp dữ liệu khai báo." : "Hồ sơ không được phép phê duyệt."}</small>
              </div>
            </div>

            <div className={`partner-admin-ocr-status ${selected.ekycVerified ? "verified" : "failed"}`}>
              {selected.ekycVerified ? <ShieldCheck size={22} /> : <FileWarning size={22} />}
              <div>
                <strong>{selected.ekycVerified ? "eKYC đã xác minh người thật" : "eKYC chưa hợp lệ"}</strong>
                <small>
                  Liveness: {selected.livenessVerified ? "Đạt" : "Chưa đạt"} · Face match: {selected.faceVerified ? "Đạt" : "Chưa đạt"} · Cosine similarity: {formatSimilarity(selected.faceSimilarity)} · Ảnh bằng chứng: {selected.ekycEvidenceAvailable ? "Có" : "Thiếu"}
                </small>
              </div>
            </div>

            <div className="partner-admin-identity-compare">
              <div className="partner-admin-documents-heading">
                <span>ĐỐI CHIẾU DANH TÍNH eKYC</span>
                <small>Ảnh camera được lưu tự động từ đúng lần quét đã PASS; người dùng không thể thay ảnh sau khi xác minh.</small>
              </div>

              <div className="partner-admin-compare-status">
                <ShieldCheck size={18} />
                <div>
                  <strong>System Admin kiểm tra thủ công trước khi duyệt</strong>
                  <small>So sánh khuôn mặt trên CCCD với ảnh camera eKYC thành công bên dưới.</small>
                </div>
              </div>

              {documentsLoading || evidenceLoading ? (
                <div className="partner-admin-doc-loading"><Loading /></div>
              ) : evidenceError ? (
                <div className="partner-admin-evidence-warning">
                  <AlertTriangle size={18} />
                  <span>{evidenceError}</span>
                </div>
              ) : documentUrls.front && evidenceUrl ? (
                <div className="partner-admin-compare-grid">
                  <figure>
                    <div className="partner-admin-compare-image">
                      <img src={documentUrls.front} alt="CCCD mặt trước để đối chiếu eKYC" />
                    </div>
                    <figcaption>
                      <ScanLine size={16} />
                      <span><strong>Ảnh CCCD mặt trước</strong><small>Nguồn: hồ sơ định danh private</small></span>
                    </figcaption>
                  </figure>
                  <figure className="verified-evidence">
                    <div className="partner-admin-compare-image">
                      <img src={evidenceUrl} alt="Ảnh camera lúc eKYC thành công" />
                      <span className="partner-admin-evidence-badge"><CheckCircle2 size={14} /> eKYC PASS</span>
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
                  <span>Chưa đủ ảnh CCCD hoặc ảnh bằng chứng eKYC để đối chiếu.</span>
                </div>
              )}

              <div className="partner-admin-evidence-metrics">
                <div><span>Liveness</span><strong className={selected.livenessVerified ? "pass" : "fail"}>{selected.livenessVerified ? "Đạt" : "Chưa đạt"}</strong></div>
                <div><span>Face match</span><strong className={selected.faceVerified ? "pass" : "fail"}>{selected.faceVerified ? "Đạt" : "Chưa đạt"}</strong></div>
                <div><span>Cosine similarity</span><strong>{formatSimilarity(selected.faceSimilarity)}</strong></div>
                <div><span>Thời điểm xác minh</span><strong>{formatDateTime(selected.ekycProcessedAt)}</strong></div>
              </div>
            </div>

            <div className="admin-detail-grid">
              <div><span>Loại hồ sơ</span><strong>{selected.applicantType === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân"}</strong></div>
              <div><span>Số CCCD khai báo</span><strong>{selected.identityNumber}</strong></div>
              <div><span>Chủ hồ sơ / Người đại diện</span><strong>{selected.representativeName || selected.legalName}</strong></div>
              <div><span>Ngày sinh khai báo</span><strong>{formatDate(selected.dateOfBirth)}</strong></div>
              <div><span>OCR số CCCD</span><strong>{selected.ocrIdentityNumber || "—"}</strong></div>
              <div><span>OCR ngày sinh</span><strong>{formatDate(selected.ocrDateOfBirth)}</strong></div>
              <div><span>OCR họ tên</span><strong>{selected.ocrFullName || "—"}</strong></div>
              <div><span>Kết quả OCR</span><strong>{selected.ocrIdentityMatched && selected.ocrNameMatched && selected.ocrDateOfBirthMatched ? "Khớp toàn bộ" : "Chưa khớp"}</strong></div>
              <div><span>Liveness</span><strong>{selected.livenessVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><span>Face match</span><strong>{selected.faceVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><span>Face similarity</span><strong>{formatSimilarity(selected.faceSimilarity)}</strong></div>
              <div><span>eKYC xử lý lúc</span><strong>{formatDateTime(selected.ekycProcessedAt)}</strong></div>
              <div><span>Số điện thoại</span><strong>{selected.businessPhone}</strong></div>
              <div><span>Địa chỉ</span><strong>{selected.businessAddress}</strong></div>
              <div className="wide"><span>Ghi chú</span><strong>{selected.note || "Không có"}</strong></div>
            </div>

            <div className="partner-admin-documents">
              <div className="partner-admin-documents-heading">
                <span>ẢNH CCCD PRIVATE</span>
                <small>Ảnh CCCD và ảnh eKYC đều private, chỉ System Admin có quyền kiểm duyệt mới tải được.</small>
              </div>
              {documentsLoading ? (
                <div className="partner-admin-doc-loading"><Loading /></div>
              ) : documentsError ? (
                <div className="partner-admin-doc-error">{documentsError}</div>
              ) : documentUrls.front && documentUrls.back ? (
                <div className="partner-admin-doc-grid">
                  <figure><img src={documentUrls.front} alt="CCCD mặt trước" /><figcaption>Mặt trước</figcaption></figure>
                  <figure><img src={documentUrls.back} alt="CCCD mặt sau" /><figcaption>Mặt sau</figcaption></figure>
                </div>
              ) : (
                <div className="partner-admin-doc-error">Hồ sơ cũ chưa có ảnh CCCD private.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {rejecting ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setRejecting(null)}>
          <section className="admin-modal small" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header"><div><span>Từ chối hồ sơ</span><h2>{rejecting.legalName}</h2></div><button type="button" onClick={() => setRejecting(null)}>×</button></div>
            <label className="admin-form-field">
              <span>Lý do từ chối</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Ví dụ: Ảnh CCCD bị lóa, face match không đáng tin cậy hoặc thông tin cần bổ sung..." />
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
                <span>PARTNER DEACTIVATION</span>
                <h2 id="admin-deactivation-review-title">
                  {deactivationAction === "approve"
                    ? "Chuyển về Customer"
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
                    "Hotel Admin"}
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
                <p>Tài khoản vẫn giữ quyền Hotel Admin khi yêu cầu bị từ chối.</p>
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
                placeholder="Nhập lý do để lưu trong audit log..."
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
                    ? "Xác nhận chuyển về Customer"
                    : "Xác nhận từ chối"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
