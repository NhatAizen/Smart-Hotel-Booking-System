import {
  BadgeCheck,
  BriefcaseBusiness,
  Eye,
  FileWarning,
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
  approvePartnerRequest,
  getPartnerRequestDocument,
  getPendingPartnerRequests,
  rejectPartnerRequest,
} from "../../services/adminService";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [documentUrls, setDocumentUrls] = useState({ front: "", back: "" });
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await getPendingPartnerRequests());
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
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

  async function handleApprove(item) {
    if (!item.ocrVerified || !item.ekycVerified) {
      setError(
        "Hồ sơ chưa vượt qua đầy đủ OCR + liveness + face match. Không thể phê duyệt.",
      );
      return;
    }
    if (
      !window.confirm(
        "Phê duyệt hồ sơ đã vượt qua OCR + eKYC và nâng tài khoản thành HOTEL_ADMIN?",
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

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">PARTNER REQUESTS</span>
          <h1>Yêu cầu trở thành đối tác</h1>
          <p>
            Kiểm tra OCR, eKYC và ảnh CCCD private trước khi cấp quyền HOTEL_ADMIN.
          </p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={loadItems}>
          <RefreshCw size={18} /> Làm mới
        </button>
      </div>

      <ErrorMessage message={error} onRetry={loadItems} />

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
                  disabled={busyId === item.id || !item.ocrVerified || !item.ekycVerified}
                >
                  <BadgeCheck size={17} /> {busyId === item.id ? "Đang xử lý..." : "Phê duyệt"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

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
                  Liveness: {selected.livenessVerified ? "Đạt" : "Chưa đạt"} · Face match: {selected.faceVerified ? "Đạt" : "Chưa đạt"} · Cosine similarity: {formatSimilarity(selected.faceSimilarity)}
                </small>
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
                <small>Ảnh tải qua API có Bearer token; eKYC Service không lưu video liveness.</small>
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
    </div>
  );
}
