import {
  BadgeCheck,
  BookOpenCheck,
  Building2,
  CreditCard,
  FileCheck2,
  Fingerprint,
  Gavel,
  HandCoins,
  LockKeyhole,
  QrCode,
  RefreshCcw,
  Save,
  Scale,
  ShieldCheck,
  Star,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Loading from "../../components/common/Loading";
import { getPlatformPolicy, updatePlatformPolicy } from "../../services/policyService";
import { statusLabel } from "../../utils/presentation";
import "./PlatformPoliciesPage.css";

const LEGAL_GROUPS = [
  { title: "Điều khoản sử dụng", icon: FileCheck2, href: "/terms" },
  { title: "Chính sách bảo mật", icon: LockKeyhole, href: "/privacy" },
  { title: "Chính sách đặt phòng", icon: BookOpenCheck },
  { title: "Thanh toán / đặt cọc", icon: CreditCard, href: "/payment-policy" },
  { title: "Hủy phòng", icon: Gavel, href: "/cancellation-policy" },
  { title: "Hoàn tiền", icon: RefreshCcw, href: "/refund-policy" },
  { title: "QR check-in / xác minh", icon: QrCode },
  { title: "Quy định đánh giá", icon: Star },
  { title: "Tài khoản & chống gian lận", icon: Fingerprint },
  { title: "Đối tác / xác minh", icon: UserRoundCheck },
  { title: "Ví, doanh thu & giải ngân", icon: WalletCards },
  { title: "Khiếu nại & tranh chấp", icon: Scale },
];

function errorCopy(error) {
  return error.response?.data?.message ?? "Không thể tải cấu hình chính sách.";
}

export default function PlatformPoliciesPage() {
  const [policy, setPolicy] = useState(null);
  const [minimumAge, setMinimumAge] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPlatformPolicy()
      .then((data) => {
        if (!active) return;
        setPolicy(data);
        setMinimumAge(String(data.minimumBookingAge ?? ""));
      })
      .catch((requestError) => active && setError(errorCopy(requestError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const runtimeRules = useMemo(() => [
    {
      icon: BadgeCheck,
      label: "Độ tuổi đặt và nhận phòng tối thiểu",
      value: policy?.minimumBookingAge == null
        ? "Chưa có cấu hình"
        : `${policy.minimumBookingAge} tuổi`,
    },
    {
      icon: QrCode,
      label: "Xác minh nhận phòng",
      value: policy?.qrIdentityVerificationMethod === "QR_CCCD"
        ? "Mã QR của đơn + xác minh CCCD tại quầy"
        : "Theo quy trình nhận phòng hiện hành",
    },
    {
      icon: Star,
      label: "Điều kiện đánh giá",
      value: policy?.reviewEligibleBookingStatus === "CHECKED_OUT"
        ? "Đơn đã trả phòng"
        : policy?.reviewEligibleBookingStatus
          ? `Đơn đặt phòng ở trạng thái ${statusLabel(policy.reviewEligibleBookingStatus)}`
          : "Theo trạng thái hoàn tất của kỳ lưu trú",
    },
    {
      icon: HandCoins,
      label: "Điều kiện gửi yêu cầu hoàn",
      value: Array.isArray(policy?.refundRequestEligibleBookingStatuses)
        ? policy.refundRequestEligibleBookingStatuses.map((item) => statusLabel(item)).join(" / ")
        : "Chưa có điều kiện được công bố",
    },
  ], [policy]);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updatePlatformPolicy({ minimumBookingAge: Number(minimumAge) });
      setPolicy(updated);
      setMinimumAge(String(updated.minimumBookingAge));
      setMessage("Đã cập nhật độ tuổi tối thiểu áp dụng cho đặt phòng và nhận phòng.");
    } catch (requestError) {
      setError(errorCopy(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading message="Đang tải chính sách EnziuRooms..." />;

  return (
    <div className="platform-policy-page">
      <header className="platform-policy-hero">
        <div>
          <span><ShieldCheck size={16} /> TRUNG TÂM CHÍNH SÁCH</span>
          <h1>Chính sách EnziuRooms</h1>
          <p>Quản lý nội dung pháp lý và các điều kiện vận hành áp dụng trên EnziuRooms.</p>
        </div>
        <div className="platform-policy-boundary">
          <Building2 size={21} />
          <span><strong>Phạm vi quản trị</strong>Quản lý khách sạn không thể chỉnh sửa chính sách nền tảng.</span>
        </div>
      </header>

      {error ? <div className="policy-feedback is-error" role="alert">{error}</div> : null}
      {message ? <div className="policy-feedback is-success" role="status">{message}</div> : null}

      <section className="platform-policy-runtime">
        <div className="platform-policy-section-heading">
          <div><small>ĐIỀU KIỆN VẬN HÀNH</small><h2>Cấu hình áp dụng toàn hệ thống</h2></div>
          <span>Có hiệu lực với các quy trình liên quan</span>
        </div>

        <div className="platform-policy-runtime-grid">
          <form className="platform-age-form" onSubmit={handleSave}>
            <label htmlFor="minimum-booking-age">Độ tuổi tối thiểu</label>
            <div className="platform-age-input">
              <input
                id="minimum-booking-age"
                type="number"
                min="16"
                max="25"
                value={minimumAge}
                onChange={(event) => setMinimumAge(event.target.value)}
                required
              />
              <span>tuổi</span>
            </div>
            <p>Độ tuổi này được áp dụng thống nhất khi đặt phòng và xác minh người nhận phòng tại quầy.</p>
            <button type="submit" disabled={saving}>
              <Save size={17} /> {saving ? "Đang lưu..." : "Lưu cấu hình"}
            </button>
          </form>

          <div className="platform-runtime-facts">
            {runtimeRules.map(({ icon: Icon, label, value }) => (
              <article key={label}><Icon size={19} /><span><small>{label}</small><strong>{value}</strong></span></article>
            ))}
          </div>
        </div>
      </section>

      <section className="platform-legal-library">
        <div className="platform-policy-section-heading">
          <div><small>NỘI DUNG PHÁP LÝ</small><h2>Thư viện chính sách nền tảng</h2></div>
          <span>Nội dung công khai và phạm vi nghiệp vụ</span>
        </div>
        <div className="platform-legal-grid">
          {LEGAL_GROUPS.map(({ title, icon: Icon, href }) => {
            const content = <><span><Icon size={20} /></span><strong>{title}</strong><small>{href ? "Xem nội dung công khai" : "Phạm vi nghiệp vụ hiện có"}</small></>;
            return href
              ? <Link key={title} to={href} target="_blank" rel="noreferrer">{content}</Link>
              : <article key={title}>{content}</article>;
          })}
        </div>
      </section>
    </div>
  );
}
