import {
  BadgeCheck,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Info,
  RotateCcw,
  ScanLine,
  Send,
  ShieldCheck,
  Trash2,
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
  contactEmail: "",
  businessTaxCode: "",
};

const PARTNER_STEPS = [
  "Loại đối tác",
  "Thông tin",
  "Xác minh danh tính",
  "Giấy tờ",
  "Kiểm tra & gửi",
];

function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

function applicantTypeLabel(value) {
  return value === "BUSINESS" ? "Doanh nghiệp / Hộ kinh doanh" : "Cá nhân";
}

function statusMeta(status) {
  if (status === "APPROVED") {
    return {
      className: "approved",
      icon: BadgeCheck,
      title: "Hồ sơ đã được phê duyệt",
      description:
        "Hồ sơ đã được duyệt. Hãy đăng nhập lại để bắt đầu quản lý khách sạn trên EnziuRooms.",
    };
  }

  if (status === "REJECTED") {
    return {
      className: "rejected",
      icon: XCircle,
      title: "Hồ sơ đã bị từ chối",
      description:
        "Hồ sơ không được phê duyệt. Lý do xử lý được hiển thị bên dưới.",
    };
  }

  if (status === "NEED_MORE_INFO") {
    return {
      className: "needs-info",
      icon: Info,
      title: "Hồ sơ cần bổ sung",
      description:
        "Vui lòng cập nhật thông tin hoặc giấy tờ theo yêu cầu rồi gửi lại hồ sơ.",
    };
  }

  if (status === "PENDING") {
    return {
      className: "pending",
      icon: Clock3,
      title: "Hồ sơ đang chờ duyệt",
      description:
        "Hồ sơ của bạn đã được gửi và đang chờ EnziuRooms xét duyệt.",
    };
  }

  return {
    className: "neutral",
    icon: Info,
    title: "Đang cập nhật trạng thái hồ sơ",
    description: "Trạng thái mới nhất chưa thể hiển thị. Vui lòng tải lại sau ít phút.",
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

function formatFileSize(value) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateSupportingFile(file) {
  if (!file) return "";
  const extension = String(file.name ?? "").toLowerCase().split(".").pop();
  const allowedType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    || ["pdf", "jpg", "jpeg", "png"].includes(extension);
  if (!allowedType) return "Chỉ hỗ trợ PDF, JPG/JPEG hoặc PNG.";
  if (file.size > 8 * 1024 * 1024) return "Tệp tối đa 8MB.";
  return "";
}

function SupportingFileField({
  title,
  description,
  required,
  file,
  existingName,
  submitting,
  onSelect,
  onRemove,
}) {
  function receiveFile(candidate) {
    if (candidate) onSelect(candidate);
  }

  return (
    <div className={`partner-supporting-upload ${file || existingName ? "has-file" : ""}`}>
      <div className="partner-supporting-upload-copy">
        <FileText size={22} />
        <div>
          <strong>{title}{required ? " *" : ""}</strong>
          <small>{description}</small>
        </div>
      </div>
      {file || existingName ? (
        <div className="partner-selected-file">
          <FileCheck2 size={20} />
          <span>
            <strong>{file?.name ?? existingName}</strong>
            <small>{submitting ? "Đang tải lên..." : file ? `${formatFileSize(file.size)} · Sẵn sàng` : "Đã lưu trong hồ sơ"}</small>
          </span>
          {file ? (
            <button type="button" onClick={onRemove} aria-label={`Xóa ${file.name}`}>
              <Trash2 size={17} />
            </button>
          ) : null}
        </div>
      ) : (
        <label
          className="partner-file-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            receiveFile(event.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud size={25} />
          <span><strong>Kéo thả tệp vào đây</strong><small>hoặc chọn từ thiết bị</small></span>
          <b>Chọn tệp</b>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={(event) => receiveFile(event.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
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
  const [activeStep, setActiveStep] = useState(1);
  const [managementProofFile, setManagementProofFile] = useState(null);
  const [businessLicenseFile, setBusinessLicenseFile] = useState(null);
  const [fileError, setFileError] = useState("");

  const status = normalizeStatus(request?.status);
  const canSubmit = !request || status === "NEED_MORE_INFO";
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
          contactEmail: partner.contactEmail ?? profile?.email ?? "",
          businessTaxCode: partner.businessTaxCode ?? "",
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
          contactEmail: profile?.email ?? current.contactEmail,
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

  function chooseSupportingFile(file, kind) {
    const validationError = validateSupportingFile(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    if (kind === "business") setBusinessLicenseFile(file);
    else setManagementProofFile(file);
    setFileError("");
    setPageError("");
  }

  function validateInformation() {
    if (!form.legalName.trim()) {
      return form.applicantType === "BUSINESS"
        ? "Vui lòng nhập tên doanh nghiệp hoặc hộ kinh doanh."
        : "Vui lòng nhập họ và tên.";
    }
    if (form.applicantType === "BUSINESS") {
      if (!form.representativeName.trim()) return "Vui lòng nhập họ tên người đại diện.";
      const taxCode = form.businessTaxCode.replace(/\D/g, "");
      if (!/^\d{10}(\d{3})?$/.test(taxCode)) {
        return "Mã số thuế phải gồm 10 hoặc 13 chữ số.";
      }
    }
    if (!form.dateOfBirth) return "Vui lòng nhập ngày sinh của chủ hồ sơ hoặc người đại diện.";
    if (!form.businessPhone.trim()) return "Vui lòng nhập số điện thoại liên hệ.";
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) {
      return "Vui lòng nhập email liên hệ hợp lệ.";
    }
    if (!form.businessAddress.trim()) {
      return form.applicantType === "BUSINESS"
        ? "Vui lòng nhập địa chỉ trụ sở."
        : "Vui lòng nhập địa chỉ liên hệ.";
    }
    return "";
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
      setSuccess(result?.message || "Thông tin trên hai mặt CCCD đã được đối chiếu thành công.");
    } catch (ocrError) {
      setOcrCheck(null);
      setOcrError(
        ocrError.response?.data?.message ||
          "Chưa đọc rõ thông tin trên CCCD. Hãy chụp lại đủ hai mặt, giữ thẻ thẳng, đủ sáng và tránh lóa.",
      );
    } finally {
      setCheckingOcr(false);
    }
  }

  function validateBase() {
    const informationError = validateInformation();
    if (informationError) return informationError;
    if (!/^\d{12}$/.test(form.identityNumber)) {
      return "CCCD phải gồm đúng 12 chữ số.";
    }
    if (/^(\d)\1{11}$/.test(form.identityNumber)) {
      return "Số CCCD không hợp lệ.";
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
      return "Vui lòng hoàn tất bước kiểm tra CCCD trước khi xác minh khuôn mặt.";
    }
    if (!ekycCapture?.verified || !ekycCapture?.verificationReceipt) {
      return "Vui lòng quét khuôn mặt đến khi vòng xác minh chuyển xanh trước khi gửi hồ sơ.";
    }
    if (form.applicantType === "BUSINESS"
      && !businessLicenseFile
      && !request?.businessLicenseAvailable) {
      return "Vui lòng tải giấy chứng nhận đăng ký doanh nghiệp hoặc hộ kinh doanh.";
    }
    const managementError = validateSupportingFile(managementProofFile);
    if (managementError) return managementError;
    const licenseError = validateSupportingFile(businessLicenseFile);
    if (licenseError) return licenseError;
    return "";
  }

  function validateCurrentStep(step) {
    if (step === 1) return form.applicantType ? "" : "Vui lòng chọn loại đối tác.";
    if (step === 2) return validateInformation();
    if (step === 3) {
      const baseError = validateBase();
      if (baseError) return baseError;
      if (!ocrCheck?.verified) return "Vui lòng hoàn tất kiểm tra CCCD.";
      if (!ekycCapture?.verified || !ekycCapture?.verificationReceipt) {
        return "Vui lòng hoàn tất xác minh khuôn mặt.";
      }
    }
    if (step === 4) {
      if (form.applicantType === "BUSINESS"
        && !businessLicenseFile
        && !request?.businessLicenseAvailable) {
        return "Vui lòng tải giấy chứng nhận đăng ký doanh nghiệp hoặc hộ kinh doanh.";
      }
      return validateSupportingFile(
        form.applicantType === "BUSINESS" ? businessLicenseFile : managementProofFile,
      );
    }
    return "";
  }

  function goToNextStep() {
    const validationError = validateCurrentStep(activeStep);
    if (validationError) {
      setPageError(validationError);
      return;
    }
    setPageError("");
    setActiveStep((current) => Math.min(PARTNER_STEPS.length, current + 1));
    window.scrollTo({ top: 120, behavior: "smooth" });
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
          contactEmail: form.contactEmail.trim(),
          businessTaxCode: form.applicantType === "BUSINESS"
            ? form.businessTaxCode.replace(/\D/g, "")
            : null,
          note: form.note.trim() || null,
        },
        frontFile,
        backFile,
        ekycCapture,
        {
          managementProof: form.applicantType === "INDIVIDUAL" ? managementProofFile : null,
          businessLicense: form.applicantType === "BUSINESS" ? businessLicenseFile : null,
        },
      );

      setRequest(saved);
      setFrontFile(null);
      setBackFile(null);
      setOcrCheck(null);
      setEkycCapture(null);
      setManagementProofFile(null);
      setBusinessLicenseFile(null);
      setActiveStep(1);
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
          "Chưa thể gửi hồ sơ. Hãy kiểm tra lại ảnh CCCD và thực hiện xác minh khuôn mặt thêm một lần nữa.",
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
              Hoàn tất hồ sơ để bắt đầu đăng phòng, quản lý đặt chỗ và vận hành khách sạn cùng EnziuRooms.
            </p>
          </div>
          <div className="partner-hero-benefits">
            <div>
              <ScanLine size={21} />
              <span>
                <strong>Xác minh danh tính</strong>
                <small>Đối chiếu CCCD và khuôn mặt trước khi gửi hồ sơ</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={21} />
              <span>
                <strong>Bảo vệ tài khoản</strong>
                <small>Giúp EnziuRooms xác nhận đúng người đăng ký</small>
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
              {["REJECTED", "NEED_MORE_INFO"].includes(status) && request.rejectionReason ? (
                <div className="partner-rejection-reason">
                  <strong>{status === "NEED_MORE_INFO" ? "Nội dung cần bổ sung:" : "Lý do:"}</strong> {request.rejectionReason}
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
              Hồ sơ đã được duyệt. Hãy đăng nhập lại để bắt đầu quản lý khách sạn trên EnziuRooms.
            </p>
          </section>
        ) : status === "PENDING" ? (
          <section className="partner-pending-detail">
            <div className="partner-section-heading">
              <div>
                <span>HỒ SƠ ĐÃ GỬI</span>
                <h2>Hồ sơ đang được xét duyệt</h2>
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
                  <strong>{request.ekycVerified ? "Khuôn mặt đã được xác minh" : "Chưa xác minh khuôn mặt"}</strong>
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
              <div><small>Email</small><strong>{request.contactEmail || "Chưa cung cấp"}</strong></div>
              {request.applicantType === "BUSINESS" ? <div><small>Mã số thuế</small><strong>{request.businessTaxCode || "Chưa cung cấp"}</strong></div> : null}
              <div className="wide"><small>Địa chỉ</small><strong>{request.businessAddress}</strong></div>
              <div><small>Giấy tờ bổ sung</small><strong>{request.applicantType === "BUSINESS"
                ? request.businessLicenseName || "Chưa cung cấp"
                : request.managementProofName || "Không cung cấp"}</strong></div>
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
                  <span>{status === "NEED_MORE_INFO" ? "BỔ SUNG HỒ SƠ" : "HỒ SƠ ĐĂNG KÝ"}</span>
                  <h2>{PARTNER_STEPS[activeStep - 1]}</h2>
                  <p>Chọn hình thức phù hợp và hoàn thiện từng bước trước khi gửi hồ sơ.</p>
                </div>
                {status === "NEED_MORE_INFO" ? <RotateCcw size={24} /> : <FileCheck2 size={24} />}
              </div>

              <nav className="partner-stepper" aria-label="Tiến trình đăng ký đối tác">
                {PARTNER_STEPS.map((step, index) => {
                  const number = index + 1;
                  const complete = number < activeStep;
                  return (
                    <button
                      type="button"
                      className={`${number === activeStep ? "active" : ""} ${complete ? "complete" : ""}`}
                      onClick={() => complete && setActiveStep(number)}
                      disabled={!complete && number !== activeStep}
                      aria-current={number === activeStep ? "step" : undefined}
                      key={step}
                    >
                      <b>{complete ? <CheckCircle2 size={16} /> : number}</b>
                      <span>{step}</span>
                    </button>
                  );
                })}
              </nav>

              {activeStep === 1 ? <fieldset className="partner-type-selector">
                <legend>Loại đối tác</legend>
                <label className={form.applicantType === "INDIVIDUAL" ? "active" : ""}>
                  <input type="radio" name="applicantType" value="INDIVIDUAL" checked={form.applicantType === "INDIVIDUAL"} onChange={updateField} />
                  <UserRound size={22} /><span><strong>Cá nhân</strong><small>Phù hợp với chủ lưu trú hoặc người trực tiếp quản lý cơ sở</small></span>
                </label>
                <label className={form.applicantType === "BUSINESS" ? "active" : ""}>
                  <input type="radio" name="applicantType" value="BUSINESS" checked={form.applicantType === "BUSINESS"} onChange={updateField} />
                  <BriefcaseBusiness size={22} /><span><strong>Doanh nghiệp / Hộ kinh doanh</strong><small>Dành cho đơn vị có giấy đăng ký kinh doanh hoặc hộ kinh doanh</small></span>
                </label>
              </fieldset> : null}

              <div className="partner-form-grid">
                {activeStep === 2 ? <>
                <label className="partner-field wide">
                  <span>{form.applicantType === "BUSINESS" ? "Tên doanh nghiệp / hộ kinh doanh" : "Họ và tên"} *</span>
                  <input name="legalName" value={form.legalName} onChange={updateField} maxLength={150} placeholder={form.applicantType === "BUSINESS" ? "Nhập tên trên giấy chứng nhận đăng ký" : "Nhập họ và tên theo CCCD"} />
                </label>

                {form.applicantType === "BUSINESS" ? (
                  <>
                    <label className="partner-field">
                      <span>Mã số thuế *</span>
                      <input name="businessTaxCode" inputMode="numeric" value={form.businessTaxCode} onChange={updateField} maxLength={13} placeholder="10 hoặc 13 chữ số" />
                    </label>
                    <label className="partner-field">
                      <span>Người đại diện *</span>
                      <input name="representativeName" value={form.representativeName} onChange={updateField} maxLength={150} placeholder="Họ tên theo CCCD" />
                    </label>
                  </>
                ) : null}

                <label className="partner-field">
                  <span>{form.applicantType === "BUSINESS" ? "Ngày sinh người đại diện" : "Ngày sinh"} *</span>
                  <div className="partner-input-icon"><CalendarDays size={17} /><input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={updateField} /></div>
                  <small>Ngày sinh phải khớp với thông tin trên CCCD.</small>
                </label>

                <label className="partner-field">
                  <span>Số điện thoại liên hệ *</span>
                  <input name="businessPhone" value={form.businessPhone} onChange={updateField} maxLength={30} placeholder="0901234567" />
                </label>

                <label className="partner-field">
                  <span>Email *</span>
                  <input type="email" name="contactEmail" value={form.contactEmail} onChange={updateField} maxLength={254} placeholder="contact@example.com" />
                </label>

                <label className="partner-field wide">
                  <span>{form.applicantType === "BUSINESS" ? "Địa chỉ trụ sở" : "Địa chỉ liên hệ"} *</span>
                  <input name="businessAddress" value={form.businessAddress} onChange={updateField} maxLength={255} placeholder={form.applicantType === "BUSINESS" ? "Địa chỉ trên giấy đăng ký" : "Địa chỉ liên hệ hiện tại"} />
                </label>
                </> : null}

                {activeStep === 3 ? <>
                <label className="partner-field wide">
                  <span>Số CCCD của {form.applicantType === "BUSINESS" ? "người đại diện" : "chủ hồ sơ"} *</span>
                  <input name="identityNumber" inputMode="numeric" value={form.identityNumber} onChange={updateIdentityNumber} maxLength={12} placeholder="079204012345" />
                  <small>Số này phải khớp với thông tin trên CCCD.</small>
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
                        <h3>{ocrCheck?.verified ? "CCCD đã được xác minh" : "Kiểm tra thông tin CCCD"}</h3>
                        <p>
                          EnziuRooms kiểm tra thông tin trên cả hai mặt CCCD và đối chiếu với nội dung bạn đã khai.
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

                        <section className="partner-mrz-result-card" aria-label="Thông tin đọc từ mặt sau CCCD">
                          <div className="partner-mrz-result-head">
                            <div>
                              <span>THÔNG TIN MẶT SAU</span>
                              <strong>Thông tin trên CCCD</strong>
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
                        <span>Chụp rõ đủ 4 góc của cả hai mặt, không phản sáng và không che thông tin. Sau khi CCCD được kiểm tra, bạn có thể tiếp tục xác minh khuôn mặt.</span>
                      </div>
                    )}


                    {ocrError ? (
                      <div className="partner-ekyc-error" role="alert">
                        <strong>Chưa đọc rõ CCCD</strong>
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
                        ? "Đang kiểm tra hai mặt CCCD..."
                        : ocrCheck?.verified
                          ? "Kiểm tra lại CCCD"
                          : "Kiểm tra CCCD"}
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
                </> : null}

                {activeStep === 4 ? (
                  <section className="partner-supporting-documents partner-field wide">
                    <div className="partner-step-intro">
                      <span>GIẤY TỜ HỒ SƠ</span>
                      <h3>{form.applicantType === "BUSINESS" ? "Giấy đăng ký kinh doanh" : "Tài liệu quyền quản lý"}</h3>
                      <p>{form.applicantType === "BUSINESS"
                        ? "Tải giấy chứng nhận đăng ký doanh nghiệp hoặc hộ kinh doanh để EnziuRooms xét duyệt."
                        : "Nếu có, bạn có thể cung cấp tài liệu chứng minh quyền sở hữu hoặc quyền quản lý cơ sở lưu trú. EnziuRooms có thể yêu cầu bổ sung tài liệu trong quá trình xét duyệt."}</p>
                    </div>

                    {form.applicantType === "BUSINESS" ? (
                      <SupportingFileField
                        title="Giấy chứng nhận đăng ký doanh nghiệp / hộ kinh doanh"
                        description="PDF, JPG, JPEG hoặc PNG · tối đa 8MB"
                        required
                        file={businessLicenseFile}
                        existingName={request?.businessLicenseName}
                        submitting={submitting}
                        onSelect={(file) => chooseSupportingFile(file, "business")}
                        onRemove={() => setBusinessLicenseFile(null)}
                      />
                    ) : (
                      <SupportingFileField
                        title="Giấy tờ chứng minh quyền quản lý cơ sở lưu trú"
                        description="Không bắt buộc · PDF, JPG, JPEG hoặc PNG · tối đa 8MB"
                        file={managementProofFile}
                        existingName={request?.managementProofName}
                        submitting={submitting}
                        onSelect={(file) => chooseSupportingFile(file, "management")}
                        onRemove={() => setManagementProofFile(null)}
                      />
                    )}

                    {fileError ? <div className="partner-file-error" role="alert">{fileError}</div> : null}
                    <div className="partner-demo-note">
                      <Info size={18} />
                      <p>Tài liệu này giúp EnziuRooms kiểm tra hồ sơ. Nếu thông tin chưa đầy đủ, bạn có thể được yêu cầu bổ sung trước khi hồ sơ được duyệt.</p>
                    </div>
                  </section>
                ) : null}

                {activeStep === 5 ? (
                  <section className="partner-review-step partner-field wide">
                    <div className="partner-step-intro">
                      <span>KIỂM TRA CUỐI</span>
                      <h3>Thông tin sẽ gửi xét duyệt</h3>
                      <p>Kiểm tra lại thông tin trước khi gửi. Bạn sẽ được thông báo ngay khi hồ sơ có kết quả.</p>
                    </div>
                    <div className="partner-review-grid">
                      <div><small>Loại đối tác</small><strong>{applicantTypeLabel(form.applicantType)}</strong></div>
                      <div><small>{form.applicantType === "BUSINESS" ? "Tên đơn vị" : "Họ và tên"}</small><strong>{form.legalName}</strong></div>
                      {form.applicantType === "BUSINESS" ? <div><small>Mã số thuế</small><strong>{form.businessTaxCode}</strong></div> : null}
                      <div><small>Người đại diện</small><strong>{form.applicantType === "BUSINESS" ? form.representativeName : form.legalName}</strong></div>
                      <div><small>Email</small><strong>{form.contactEmail}</strong></div>
                      <div><small>Điện thoại</small><strong>{form.businessPhone}</strong></div>
                      <div className="wide"><small>Địa chỉ</small><strong>{form.businessAddress}</strong></div>
                      <div><small>Số CCCD</small><strong>{form.identityNumber}</strong></div>
                      <div><small>Xác minh CCCD</small><strong>{ocrCheck?.verified ? "Đã hoàn tất" : "Chưa hoàn tất"}</strong></div>
                      <div><small>Khuôn mặt</small><strong>{ekycCapture?.verified ? "Đã xác minh" : "Chưa hoàn tất"}</strong></div>
                      <div><small>Giấy tờ bổ sung</small><strong>{form.applicantType === "BUSINESS"
                        ? businessLicenseFile?.name ?? request?.businessLicenseName ?? "Chưa có"
                        : managementProofFile?.name ?? request?.managementProofName ?? "Không cung cấp"}</strong></div>
                    </div>
                    <label className="partner-field wide">
                      <span>Ghi chú</span>
                      <textarea name="note" value={form.note} onChange={updateField} maxLength={1000} placeholder="Bạn có thể ghi thêm thông tin cần EnziuRooms lưu ý..." />
                    </label>
                  </section>
                ) : null}
              </div>

              {activeStep === 5 ? <div className="partner-form-consent">
                <ShieldCheck size={19} />
                <p>
                  Khi gửi hồ sơ, bạn xác nhận thông tin đã khai khớp với giấy tờ cung cấp. EnziuRooms có thể yêu cầu bổ sung nếu hồ sơ chưa đầy đủ.
                </p>
              </div> : null}

              <div className="partner-form-actions partner-wizard-actions">
                {activeStep > 1 ? (
                  <button type="button" className="partner-back-button" onClick={() => setActiveStep((current) => current - 1)}>
                    <ArrowLeft size={18} /> Quay lại
                  </button>
                ) : <span />}
                {activeStep < PARTNER_STEPS.length ? (
                  <button type="button" className="partner-next-button" onClick={goToNextStep}>
                    Tiếp tục <ArrowRight size={18} />
                  </button>
                ) : (
                  <button type="submit" className="partner-submit-button" disabled={submitting || !ocrCheck?.verified || !ekycCapture?.verified || !ekycCapture?.verificationReceipt}>
                    <Send size={18} />
                    {submitting ? "Đang gửi hồ sơ..." : status === "NEED_MORE_INFO" ? "Gửi lại hồ sơ" : "Gửi hồ sơ xét duyệt"}
                  </button>
                )}
              </div>
            </form>

            <aside className="partner-guide-card">
              <span>CÁC BƯỚC XÁC MINH</span>
              <h2>Bạn sẽ thực hiện những gì?</h2>
              <ol>
                <li><b>1</b><div><strong>Chụp hai mặt CCCD</strong><small>Đảm bảo ảnh rõ, đủ góc và không bị lóa.</small></div></li>
                <li><b>2</b><div><strong>Xác minh khuôn mặt</strong><small>Nhìn thẳng vào camera và giữ khuôn mặt trong khung.</small></div></li>
                <li><b>3</b><div><strong>Đối chiếu chân dung</strong><small>EnziuRooms so sánh khuôn mặt với ảnh trên CCCD.</small></div></li>
                <li><b>4</b><div><strong>Bổ sung giấy tờ</strong><small>Tải tài liệu cần thiết theo loại đối tác đã chọn.</small></div></li>
                <li><b>5</b><div><strong>Gửi hồ sơ chờ duyệt</strong><small>EnziuRooms sẽ thông báo khi hồ sơ có kết quả.</small></div></li>
              </ol>
              <div className="partner-guide-note"><Info size={18} /><p>Thông tin bạn cung cấp chỉ được sử dụng cho việc xác minh và xét duyệt hồ sơ đối tác.</p></div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
