import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Info,
  RotateCcw,
  ScanLine,
  Send,
  ShieldCheck,
  UploadCloud,
  UserRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import EkycCameraCapture from "../../components/partner/EkycCameraCapture";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  getMyPartnerRequest,
  getMyProfile,
  submitPartnerRequest,
  verifyPartnerOcr,
} from "../../services/profileService";
import "./PartnerApplicationPage.css";

const EMPTY_FORM = {
  applicantType: "INDIVIDUAL",
  legalName: "",
  representativeName: "",
  identityNumber: "",
  dateOfBirth: "",
  businessPhone: "",
  businessAddress: "",
  note: "",
};

function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

function applicantTypeLabel(value) {
  return value === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân";
}

function statusMeta(status) {
  if (status === "APPROVED") {
    return {
      className: "approved",
      icon: BadgeCheck,
      title: "Hồ sơ đã được phê duyệt",
      description:
        "Tài khoản đối tác đã được kích hoạt. Hãy đăng xuất và đăng nhập lại để bắt đầu sử dụng.",
    };
  }

  if (status === "REJECTED") {
    return {
      className: "rejected",
      icon: XCircle,
      title: "Hồ sơ cần bổ sung",
      description:
        "Hồ sơ chưa được duyệt. Bạn có thể cập nhật thông tin, chụp lại CCCD và xác minh lại.",
    };
  }

  return {
    className: "pending",
    icon: Clock3,
    title: "Hồ sơ đang chờ duyệt",
    description:
      "Thông tin CCCD và khuôn mặt đã được xác minh. Hồ sơ đang chờ xét duyệt.",
  };
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

function formatCompactDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
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
    return "—";
  }
}

function formatSimilarity(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : "—";
}

function validateImage(file, label) {
  if (!file) return `Vui lòng tải ảnh CCCD ${label}.`;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return `CCCD ${label} chỉ hỗ trợ JPG/JPEG hoặc PNG.`;
  }
  if (file.size > 8 * 1024 * 1024) {
    return `Ảnh CCCD ${label} tối đa 8MB.`;
  }
  return "";
}

export default function PartnerApplicationPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [request, setRequest] = useState(null);
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");
  const [ekycCapture, setEkycCapture] = useState(null);
  const [ekycResetVersion, setEkycResetVersion] = useState(0);
  const [ocrCheck, setOcrCheck] = useState(null);
  const [checkingOcr, setCheckingOcr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [ocrError, setOcrError] = useState("");
  const [success, setSuccess] = useState("");

  const status = normalizeStatus(request?.status);
  const canSubmit = !request || status === "REJECTED";
  const currentStatus = useMemo(
    () => (request ? statusMeta(status) : null),
    [request, status],
  );
  const StatusIcon = currentStatus?.icon;

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    setOcrError("");

    try {
      const [profileResult, partnerResult] = await Promise.allSettled([
        getMyProfile(),
        getMyPartnerRequest(),
      ]);
      const profile =
        profileResult.status === "fulfilled" ? profileResult.value : null;
      const partner =
        partnerResult.status === "fulfilled" ? partnerResult.value : null;

      setRequest(partner);
      if (partner) {
        setForm({
          applicantType: partner.applicantType ?? "INDIVIDUAL",
          legalName: partner.legalName ?? "",
          representativeName:
            partner.representativeName ?? partner.legalName ?? "",
          identityNumber: partner.identityNumber ?? "",
          dateOfBirth: partner.dateOfBirth ?? "",
          businessPhone: partner.businessPhone ?? "",
          businessAddress: partner.businessAddress ?? "",
          note: partner.note ?? "",
        });
      } else {
        setForm((current) => ({
          ...current,
          legalName: profile?.fullName ?? current.legalName,
          representativeName: profile?.fullName ?? current.representativeName,
          businessPhone: profile?.phone ?? current.businessPhone,
          businessAddress:
            profile?.address ?? profile?.city ?? current.businessAddress,
        }));
      }
    } catch (requestError) {
      setPageError(
        requestError.response?.data?.message ??
          "Không thể tải thông tin đăng ký đối tác.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadData, { debounceMs: 120 });

  useEffect(
    () => () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
    },
    [frontPreview, backPreview],
  );

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "legalName" && current.applicantType === "INDIVIDUAL") {
        next.representativeName = value;
      }
      if (name === "applicantType" && value === "INDIVIDUAL") {
        next.representativeName = current.legalName;
      }
      return next;
    });
    if (["applicantType", "legalName", "representativeName", "dateOfBirth"].includes(name)) {
      setOcrCheck(null);
      setEkycCapture(null);
    }
    setPageError("");
    setOcrError("");
    setSuccess("");
  }

  function updateIdentityNumber(event) {
    const value = event.target.value.replace(/\D/g, "").slice(0, 12);
    setForm((current) => ({ ...current, identityNumber: value }));
    setOcrCheck(null);
    setEkycCapture(null);
    setPageError("");
    setOcrError("");
  }

  function chooseImage(event, side) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    const imageError = validateImage(
      file,
      side === "front" ? "mặt trước" : "mặt sau",
    );
    if (imageError) {
      setOcrError(imageError);
      setPageError("");
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    if (side === "front") {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontFile(file);
      setFrontPreview(url);
      // OCR + face match must always bind to the currently selected front image.
      setOcrCheck(null);
      setEkycCapture(null);
    } else {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackFile(file);
      setBackPreview(url);
      setOcrCheck(null);
      setEkycCapture(null);
    }
    setPageError("");
    setOcrError("");
    setSuccess("");
  }

  function validateOcrInputs() {
    const representativeName =
      form.applicantType === "INDIVIDUAL"
        ? form.legalName.trim()
        : form.representativeName.trim();

    if (!representativeName) {
      return form.applicantType === "BUSINESS"
        ? "Vui lòng nhập họ tên người đại diện đúng như trên CCCD."
        : "Vui lòng nhập họ tên đúng như trên CCCD.";
    }
    if (!/^\d{12}$/.test(form.identityNumber)) {
      return "CCCD phải gồm đúng 12 chữ số.";
    }
    if (/^(\d)\1{11}$/.test(form.identityNumber)) {
      return "Số CCCD không hợp lệ.";
    }
    if (!form.dateOfBirth) return "Vui lòng nhập ngày sinh đúng trên CCCD.";

    const frontError = validateImage(frontFile, "mặt trước");
    if (frontError) return frontError;
    const backError = validateImage(backFile, "mặt sau");
    if (backError) return backError;
    return "";
  }

  async function handleVerifyOcr() {
    const validationError = validateOcrInputs();
    if (validationError) {
      setOcrError(validationError);
      setPageError("");
      return;
    }

    const representativeName =
      form.applicantType === "INDIVIDUAL"
        ? form.legalName.trim()
        : form.representativeName.trim();

    setCheckingOcr(true);
    setOcrError("");
    setPageError("");
    setSuccess("");
    setOcrCheck(null);
    setEkycCapture(null);

    try {
      const result = await verifyPartnerOcr(
        {
          identityNumber: form.identityNumber,
          fullName: representativeName,
          dateOfBirth: form.dateOfBirth,
        },
        frontFile,
        backFile,
      );
      setOcrCheck(result);
      setSuccess(result?.message || "CCCD mặt trước và mặt sau đã được OCR/MRZ và đối chiếu thành công.");
    } catch (ocrError) {
      setOcrCheck(null);
      setOcrError(
        ocrError.response?.data?.message ||
          "OCR/MRZ chưa đọc chắc chắn được CCCD. Hãy chụp rõ cả mặt trước và mặt sau, giữ thẻ thẳng, gần hơn, đủ sáng và tránh lóa.",
      );
    } finally {
      setCheckingOcr(false);
    }
  }

  function validateBase() {
    if (!form.legalName.trim()) {
      return "Vui lòng nhập họ tên hoặc tên doanh nghiệp.";
    }
    if (form.applicantType === "BUSINESS" && !form.representativeName.trim()) {
      return "Vui lòng nhập họ tên người đại diện pháp luật.";
    }
    if (!/^\d{12}$/.test(form.identityNumber)) {
      return "CCCD phải gồm đúng 12 chữ số.";
    }
    if (/^(\d)\1{11}$/.test(form.identityNumber)) {
      return "Số CCCD không hợp lệ.";
    }
    if (!form.dateOfBirth) return "Vui lòng nhập ngày sinh đúng trên CCCD.";
    if (!form.businessPhone.trim()) {
      return "Vui lòng nhập số điện thoại liên hệ.";
    }
    if (!form.businessAddress.trim()) {
      return "Vui lòng nhập địa chỉ liên hệ.";
    }

    const frontError = validateImage(frontFile, "mặt trước");
    if (frontError) return frontError;
    const backError = validateImage(backFile, "mặt sau");
    if (backError) return backError;
    return "";
  }

  function validate() {
    const baseError = validateBase();
    if (baseError) return baseError;
    if (!ocrCheck?.verified) {
      return "Vui lòng kiểm tra OCR CCCD thành công trước khi xác minh khuôn mặt.";
    }
    if (!ekycCapture?.verified || !ekycCapture?.verificationReceipt) {
      return "Vui lòng quét khuôn mặt đến khi vòng xác minh chuyển xanh trước khi gửi hồ sơ.";
    }
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setPageError(validationError);
      return;
    }

    if (
      !window.confirm(
        "CCCD và khuôn mặt đã được xác minh. Gửi hồ sơ này để xét duyệt?",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setPageError("");
    setOcrError("");
    setSuccess("");

    try {
      const representativeName =
        form.applicantType === "INDIVIDUAL"
          ? form.legalName.trim()
          : form.representativeName.trim();

      const saved = await submitPartnerRequest(
        {
          applicantType: form.applicantType,
          legalName: form.legalName.trim(),
          representativeName,
          identityNumber: form.identityNumber,
          dateOfBirth: form.dateOfBirth,
          businessPhone: form.businessPhone.trim(),
          businessAddress: form.businessAddress.trim(),
          note: form.note.trim() || null,
        },
        frontFile,
        backFile,
        ekycCapture,
      );

      setRequest(saved);
      setFrontFile(null);
      setBackFile(null);
      setOcrCheck(null);
      setEkycCapture(null);
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
      setFrontPreview("");
      setBackPreview("");
      setSuccess(
        "Hồ sơ xác minh đã được gửi để xét duyệt.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      const responseMessage = requestError.response?.data?.message;
      const responseCode = requestError.response?.data?.code;
      if (responseCode === "PARTNER_EKYC_VERIFICATION_FAILED") {
        setEkycCapture(null);
        setEkycResetVersion((value) => value + 1);
      }
      setPageError(
        responseMessage ??
          "Không thể xác minh/gửi hồ sơ. Hãy dùng ảnh CCCD rõ nét và thực hiện camera eKYC lại.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="partner-application-page">
        <div className="container partner-application-loading">
          <Loading />
        </div>
      </main>
    );
  }

  return (
    <main className="partner-application-page">
      <div className="container partner-application-shell">
        <section className="partner-application-hero">
          <div className="partner-hero-copy">
            <span className="partner-eyebrow">
              <Building2 size={15} /> ĐỐI TÁC ENZIUROOMS
            </span>
            <h1>Trở thành đối tác khách sạn</h1>
            <p>
              Xác minh danh tính bằng CCCD và khuôn mặt trước khi gửi hồ sơ xét duyệt.
            </p>
          </div>
          <div className="partner-hero-benefits">
            <div>
              <ScanLine size={21} />
              <span>
                <strong>Xác minh danh tính</strong>
                <small>Đối chiếu CCCD và khuôn mặt trực tiếp</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={21} />
              <span>
                <strong>Kiểm tra người thật</strong>
                <small>Camera chỉ dùng trong bước xác minh</small>
              </span>
            </div>
          </div>
        </section>

        <ErrorMessage message={pageError} />
        {success ? (
          <div className="partner-success-message">
            <CheckCircle2 size={20} />
            <span>{success}</span>
          </div>
        ) : null}

        {request ? (
          <section className={`partner-status-card ${currentStatus.className}`}>
            <div className="partner-status-icon">
              {StatusIcon ? <StatusIcon size={28} /> : null}
            </div>
            <div className="partner-status-copy">
              <span>TRẠNG THÁI HỒ SƠ</span>
              <h2>{currentStatus.title}</h2>
              <p>{currentStatus.description}</p>
              {status === "REJECTED" && request.rejectionReason ? (
                <div className="partner-rejection-reason">
                  <strong>Lý do:</strong> {request.rejectionReason}
                </div>
              ) : null}
            </div>
            <div className="partner-status-time">
              <small>Cập nhật gần nhất</small>
              <strong>{formatDateTime(request.updatedAt)}</strong>
            </div>
          </section>
        ) : null}

        {status === "APPROVED" ? (
          <section className="partner-approved-panel">
            <BadgeCheck size={52} />
            <h2>Chào mừng bạn trở thành đối tác EnziuRooms</h2>
            <p>
              Tài khoản đối tác đã được kích hoạt. Hãy đăng xuất rồi đăng nhập lại để bắt đầu quản lý khách sạn.
            </p>
          </section>
        ) : status === "PENDING" ? (
          <section className="partner-pending-detail">
            <div className="partner-section-heading">
              <div>
                <span>HỒ SƠ ĐÃ GỬI</span>
                <h2>Hồ sơ đã xác minh</h2>
              </div>
              <BadgeCheck size={28} />
            </div>

            <div className="partner-verification-banners">
              <div className={`partner-ocr-banner ${request.ocrVerified ? "verified" : "failed"}`}>
                <BadgeCheck size={22} />
                <div>
                  <strong>{request.ocrVerified ? "CCCD đã xác minh" : "CCCD chưa xác minh"}</strong>
                  <small>Số CCCD, họ tên và ngày sinh đã được đối chiếu.</small>
                </div>
              </div>
              <div className={`partner-ocr-banner ${request.ekycVerified ? "verified" : "failed"}`}>
                <ShieldCheck size={22} />
                <div>
                  <strong>{request.ekycVerified ? "Xác minh khuôn mặt hợp lệ" : "Chưa có eKYC hợp lệ"}</strong>
                  <small>Khuôn mặt đã được đối chiếu với ảnh trên CCCD.</small>
                </div>
              </div>
            </div>

            <div className="partner-summary-grid">
              <div><small>Loại đối tác</small><strong>{applicantTypeLabel(request.applicantType)}</strong></div>
              <div><small>Họ tên / Doanh nghiệp</small><strong>{request.legalName}</strong></div>
              <div><small>Chủ hồ sơ / Người đại diện</small><strong>{request.representativeName}</strong></div>
              <div><small>Số CCCD</small><strong>{request.identityNumber}</strong></div>
              <div><small>Ngày sinh</small><strong>{formatDate(request.dateOfBirth)}</strong></div>
              <div><small>Điện thoại</small><strong>{request.businessPhone}</strong></div>
              <div className="wide"><small>Địa chỉ</small><strong>{request.businessAddress}</strong></div>
              <div><small>Xác minh CCCD</small><strong>{request.ocrVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><small>Xác minh khuôn mặt</small><strong>{request.ekycVerified ? "Đạt" : "Chưa đạt"}</strong></div>
              <div><small>Xác minh lúc</small><strong>{formatDateTime(request.ekycProcessedAt)}</strong></div>
            </div>

            <div className="partner-pending-note">
              <ShieldCheck size={19} />
              <span>
                Thông tin xác minh được bảo vệ và chỉ dùng cho quá trình xét duyệt hồ sơ đối tác.
              </span>
            </div>
          </section>
        ) : canSubmit ? (
          <div className="partner-application-content">
            <form className="partner-form-card" onSubmit={handleSubmit}>
              <div className="partner-section-heading">
                <div>
                  <span>{status === "REJECTED" ? "GỬI LẠI HỒ SƠ" : "HỒ SƠ ĐĂNG KÝ"}</span>
                  <h2>{status === "REJECTED" ? "Cập nhật và xác minh lại" : "Thông tin định danh"}</h2>
                  <p>Thông tin dưới đây phải trùng với CCCD được tải lên.</p>
                </div>
                {status === "REJECTED" ? <RotateCcw size={24} /> : <FileCheck2 size={24} />}
              </div>

              <fieldset className="partner-type-selector">
                <legend>Loại đối tác</legend>
                <label className={form.applicantType === "INDIVIDUAL" ? "active" : ""}>
                  <input type="radio" name="applicantType" value="INDIVIDUAL" checked={form.applicantType === "INDIVIDUAL"} onChange={updateField} />
                  <UserRound size={22} /><span><strong>Cá nhân</strong><small>Chủ cơ sở / hộ kinh doanh</small></span>
                </label>
                <label className={form.applicantType === "BUSINESS" ? "active" : ""}>
                  <input type="radio" name="applicantType" value="BUSINESS" checked={form.applicantType === "BUSINESS"} onChange={updateField} />
                  <BriefcaseBusiness size={22} /><span><strong>Doanh nghiệp</strong><small>Công ty / pháp nhân</small></span>
                </label>
              </fieldset>

              <div className="partner-form-grid">
                <label className="partner-field wide">
                  <span>{form.applicantType === "BUSINESS" ? "Tên doanh nghiệp" : "Họ và tên pháp lý"} *</span>
                  <input name="legalName" value={form.legalName} onChange={updateField} maxLength={150} placeholder={form.applicantType === "BUSINESS" ? "Công ty TNHH Enziu Hotel" : "Nguyễn Văn A"} />
                </label>

                {form.applicantType === "BUSINESS" ? (
                  <label className="partner-field wide">
                    <span>Họ tên người đại diện trên CCCD *</span>
                    <input name="representativeName" value={form.representativeName} onChange={updateField} maxLength={150} placeholder="Nguyễn Văn A" />
                  </label>
                ) : null}

                <label className="partner-field">
                  <span>Số CCCD 12 chữ số *</span>
                  <input name="identityNumber" inputMode="numeric" value={form.identityNumber} onChange={updateIdentityNumber} maxLength={12} placeholder="079204012345" />
                  <small>Số này phải khớp với thông tin trên CCCD.</small>
                </label>

                <label className="partner-field">
                  <span>Ngày sinh trên CCCD *</span>
                  <div className="partner-input-icon"><CalendarDays size={17} /><input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={updateField} /></div>
                  <small>Ngày sinh phải khớp với thông tin trên CCCD.</small>
                </label>

                <label className="partner-field">
                  <span>Số điện thoại liên hệ *</span>
                  <input name="businessPhone" value={form.businessPhone} onChange={updateField} maxLength={30} placeholder="0901234567" />
                </label>

                <label className="partner-field">
                  <span>Địa chỉ liên hệ *</span>
                  <input name="businessAddress" value={form.businessAddress} onChange={updateField} maxLength={255} placeholder="TP. Hồ Chí Minh" />
                </label>

                <div className="partner-field wide">
                  <span>Ảnh CCCD bắt buộc *</span>
                  <div className="partner-document-grid">
                    <label className={`partner-upload-box ${frontPreview ? "has-image" : ""}`}>
                      <input type="file" accept="image/jpeg,image/png" onChange={(event) => chooseImage(event, "front")} />
                      {frontPreview ? <img src={frontPreview} alt="CCCD mặt trước" /> : <><UploadCloud size={30} /><strong>CCCD mặt trước</strong><small>JPG/PNG · tối đa 8MB</small></>}
                      {frontPreview ? <span>Đổi ảnh mặt trước</span> : null}
                    </label>
                    <label className={`partner-upload-box ${backPreview ? "has-image" : ""}`}>
                      <input type="file" accept="image/jpeg,image/png" onChange={(event) => chooseImage(event, "back")} />
                      {backPreview ? <img src={backPreview} alt="CCCD mặt sau" /> : <><UploadCloud size={30} /><strong>CCCD mặt sau</strong><small>JPG/PNG · tối đa 8MB</small></>}
                      {backPreview ? <span>Đổi ảnh mặt sau</span> : null}
                    </label>
                  </div>
                  <small>Chụp đủ 4 góc, không lóa, không che thông tin và mặt trước phải thấy rõ ảnh chân dung.</small>
                </div>

                <div className="partner-field wide">
                  <section className={`partner-ocr-precheck-card ${ocrCheck?.verified ? "verified" : ""}`}>
                    <div className="partner-ocr-precheck-head">
                      <div className="partner-ocr-precheck-icon">
                        {ocrCheck?.verified ? <CheckCircle2 size={22} /> : <ScanLine size={22} />}
                      </div>
                      <div>
                        <span>BƯỚC 1 · KIỂM TRA CCCD</span>
                        <h3>{ocrCheck?.verified ? "CCCD đã được xác minh" : "OCR và đối chiếu thông tin"}</h3>
                        <p>
                          Hệ thống OCR cả mặt trước và mặt sau. Mặt trước đối chiếu số CCCD, họ tên và ngày sinh; mặt sau đọc MRZ để xác nhận hai ảnh thuộc cùng một CCCD.
                        </p>
                      </div>
                    </div>

                    {ocrCheck?.verified ? (
                      <>
                        <div className="partner-ocr-precheck-results">
                          <div><CheckCircle2 size={16} /><span>Số CCCD</span><strong>{ocrCheck.identityNumber || form.identityNumber}</strong></div>
                          <div><CheckCircle2 size={16} /><span>Họ tên</span><strong>{ocrCheck.fullName || (form.applicantType === "INDIVIDUAL" ? form.legalName : form.representativeName)}</strong></div>
                          <div><CheckCircle2 size={16} /><span>Ngày sinh</span><strong>{formatCompactDate(ocrCheck.dateOfBirth || form.dateOfBirth)}</strong></div>
                        </div>

                        <section className="partner-mrz-result-card" aria-label="Kết quả xác minh MRZ mặt sau">
                          <div className="partner-mrz-result-head">
                            <div>
                              <span>MẶT SAU / MRZ</span>
                              <strong>Thông tin đọc từ vùng MRZ</strong>
                            </div>
                            <span className="partner-mrz-valid-badge">
                              <CheckCircle2 size={16} /> Hợp lệ
                            </span>
                          </div>

                          <div className="partner-mrz-detail-grid">
                            <div>
                              <span>Số định danh</span>
                              <strong>{ocrCheck.mrzIdentityNumber || ocrCheck.identityNumber || form.identityNumber}</strong>
                            </div>
                            <div>
                              <span>Ngày sinh</span>
                              <strong>{formatCompactDate(ocrCheck.mrzDateOfBirth || ocrCheck.dateOfBirth || form.dateOfBirth)}</strong>
                            </div>
                            <div>
                              <span>Giới tính</span>
                              <strong>{ocrCheck.mrzGender || "—"}</strong>
                            </div>
                            <div>
                              <span>Quốc tịch</span>
                              <strong>{ocrCheck.mrzNationality || "—"}</strong>
                            </div>
                            <div>
                              <span>Ngày hết hạn</span>
                              <strong>{formatCompactDate(ocrCheck.mrzExpiryDate)}</strong>
                            </div>
                          </div>

                          <div className="partner-mrz-match-banner">
                            <CheckCircle2 size={17} />
                            <span>Khớp với thông tin mặt trước</span>
                          </div>
                        </section>
                      </>
                    ) : (
                      <div className="partner-ocr-precheck-note">
                        <Info size={17} />
                        <span>Chụp rõ đủ 4 góc của cả hai mặt, không phản sáng; đặc biệt giữ rõ vùng MRZ ở cạnh dưới mặt sau. Chỉ khi OCR + MRZ cùng đạt thì bước camera mới được mở.</span>
                      </div>
                    )}


                    {ocrError ? (
                      <div className="partner-ekyc-error" role="alert">
                        <strong>OCR CCCD chưa đạt</strong>
                        <span>{ocrError}</span>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="partner-ocr-check-button"
                      disabled={checkingOcr || !frontFile || !backFile}
                      onClick={handleVerifyOcr}
                    >
                      <ScanLine size={18} />
                      {checkingOcr
                        ? "Đang quét cả 2 mặt CCCD..."
                        : ocrCheck?.verified
                          ? "Kiểm tra lại CCCD"
                          : "Kiểm tra OCR CCCD"}
                    </button>
                  </section>
                </div>

                <div className="partner-field wide">
                  <EkycCameraCapture
                    key={`${frontFile?.name ?? "no-front"}-${frontFile?.lastModified ?? 0}-${ocrCheck?.verified ? "ocr-ok" : "ocr-wait"}-${ekycResetVersion}`}
                    disabled={!ocrCheck?.verified}
                    cccdFront={frontFile}
                    onReady={setEkycCapture}
                    onInteraction={() => setPageError("")}
                  />
                </div>

                <label className="partner-field wide">
                  <span>Ghi chú</span>
                  <textarea name="note" value={form.note} onChange={updateField} maxLength={1000} placeholder="Ghi chú thêm cho hồ sơ..." />
                </label>
              </div>

              <div className="partner-form-consent">
                <ShieldCheck size={19} />
                <p>
                  EnziuRooms sẽ <strong>kiểm tra CCCD, xác minh người thật và đối chiếu khuôn mặt</strong> trước khi gửi hồ sơ. Bạn chỉ cần bắt đầu một lần và giữ khuôn mặt trong khung đến khi xác minh thành công.
                </p>
              </div>

              <div className="partner-form-actions">
                <button type="submit" className="partner-submit-button" disabled={submitting || !ocrCheck?.verified || !ekycCapture?.verified || !ekycCapture?.verificationReceipt}>
                  <Send size={18} />
                  {submitting ? "Đang gửi hồ sơ..." : status === "REJECTED" ? "Gửi lại hồ sơ đã xác minh" : "Gửi hồ sơ đã xác minh"}
                </button>
              </div>
            </form>

            <aside className="partner-guide-card">
              <span>QUY TRÌNH eKYC</span>
              <h2>Hệ thống kiểm tra gì?</h2>
              <ol>
                <li><b>1</b><div><strong>Kiểm tra CCCD hai mặt</strong><small>Đọc và đối chiếu thông tin trên mặt trước và mặt sau.</small></div></li>
                <li><b>2</b><div><strong>Camera trực tiếp</strong><small>Sử dụng camera để xác minh khuôn mặt tại thời điểm đăng ký.</small></div></li>
                <li><b>3</b><div><strong>Xác minh người thật</strong><small>Giữ khuôn mặt chính diện trong khung đến khi vòng chuyển xanh.</small></div></li>
                <li><b>4</b><div><strong>Đối chiếu khuôn mặt</strong><small>So sánh khuôn mặt camera với ảnh chân dung trên CCCD.</small></div></li>
                <li><b>5</b><div><strong>Xét duyệt hồ sơ</strong><small>Hồ sơ được kiểm tra trước khi tài khoản đối tác được kích hoạt.</small></div></li>
              </ol>
              <div className="partner-guide-note"><Info size={18} /><p>Thông tin xác minh được dùng để hỗ trợ xét duyệt và bảo vệ tài khoản đối tác.</p></div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
