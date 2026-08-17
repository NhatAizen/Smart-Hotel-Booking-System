import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CircleUserRound,
  FileBadge2,
  Hotel,
  ImageOff,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../../auth/AuthContext";
import { ErrorState, StatusBadge } from "../ui";
import { getMyHotels } from "../../services/hotelAdminService";
import {
  getMyPartnerRequest,
  getMyProfile,
  removeMyAvatar,
  updateMyProfile,
  uploadMyAvatar,
} from "../../services/profileService";
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";

import "./AccountProfilePanel.css";

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  city: "",
  address: "",
  bio: "",
};

function valueOrEmpty(value) {
  return value ?? "";
}

function profileToForm(profile) {
  return {
    fullName: valueOrEmpty(profile?.fullName),
    phone: valueOrEmpty(profile?.phone),
    dateOfBirth: valueOrEmpty(profile?.dateOfBirth),
    gender: valueOrEmpty(profile?.gender),
    nationality: valueOrEmpty(profile?.nationality),
    city: valueOrEmpty(profile?.city),
    address: valueOrEmpty(profile?.address),
    bio: valueOrEmpty(profile?.bio),
  };
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message
    ?? error?.response?.data?.error
    ?? error?.message
    ?? fallback
  );
}

function formatDate(value) {
  if (!value) {
    return "Chưa cập nhật";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Chưa cập nhật";
  }

  return new Intl.DateTimeFormat(
    "vi-VN",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(date);
}

function partnerStatusLabel(status) {
  if (status === "APPROVED") return "Đã xác minh đối tác";
  if (status === "PENDING") return "Đang chờ duyệt";
  if (status === "REJECTED") return "Cần cập nhật hồ sơ";
  return "Chưa có hồ sơ đối tác";
}

function partnerTypeLabel(type) {
  if (type === "BUSINESS") return "Doanh nghiệp";
  if (type === "INDIVIDUAL") return "Cá nhân";
  return "Đối tác khách sạn";
}

function accountStatusLabel(status) {
  return STATUS_LABELS[normalizeEnum(status)] ?? "Chưa có dữ liệu";
}

export default function AccountProfilePanel({ mode = "customer" }) {
  const isHotelAdmin = mode === "hotel-admin";
  const { user, updateCachedUser } = useAuth();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [partner, setPartner] = useState(null);
  const [hotelCount, setHotelCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const displayRole = isHotelAdmin
    ? "Đối tác"
    : "Khách hàng";
  const accountStatus = profile?.status ?? profile?.accountStatus ?? user?.status ?? "";

  const avatarInitial = useMemo(() => {
    const text = profile?.fullName ?? user?.fullName ?? "U";
    return text.trim().charAt(0).toUpperCase() || "U";
  }, [profile?.fullName, user?.fullName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const profileData = await getMyProfile();
        if (cancelled) return;

        setProfile(profileData);
        setForm(profileToForm(profileData));
        updateCachedUser?.(profileData);

        if (isHotelAdmin) {
          const [partnerResult, hotelsResult] = await Promise.allSettled([
            getMyPartnerRequest(),
            getMyHotels(),
          ]);

          if (cancelled) return;

          if (partnerResult.status === "fulfilled") {
            setPartner(partnerResult.value);
          }

          if (hotelsResult.status === "fulfilled") {
            setHotelCount(
              Array.isArray(hotelsResult.value)
                ? hotelsResult.value.length
                : 0,
            );
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getErrorMessage(
              loadError,
              "Không thể tải hồ sơ tài khoản.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isHotelAdmin, reloadKey, updateCachedUser]);

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setMessage("");
    setError("");
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!form.fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const updated = await updateMyProfile({
        ...form,
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth || null,
      });

      setProfile(updated);
      setForm(profileToForm(updated));
      updateCachedUser?.(updated);
      setMessage("Đã lưu thay đổi hồ sơ.");
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Không thể cập nhật hồ sơ.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh đại diện tối đa 5 MB.");
      return;
    }

    setAvatarSaving(true);
    setMessage("");
    setError("");

    try {
      const updated = await uploadMyAvatar(file);
      setProfile(updated);
      updateCachedUser?.(updated);
      setMessage("Đã cập nhật ảnh đại diện.");
    } catch (uploadError) {
      setError(
        getErrorMessage(
          uploadError,
          "Không thể tải ảnh đại diện.",
        ),
      );
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!profile?.avatarUrl || avatarSaving) return;

    setAvatarSaving(true);
    setMessage("");
    setError("");

    try {
      const updated = await removeMyAvatar();
      setProfile(updated);
      updateCachedUser?.(updated);
      setMessage("Đã xóa ảnh đại diện.");
    } catch (removeError) {
      setError(
        getErrorMessage(
          removeError,
          "Không thể xóa ảnh đại diện.",
        ),
      );
    } finally {
      setAvatarSaving(false);
    }
  }

  function resetForm() {
    setForm(profileToForm(profile));
    setMessage("");
    setError("");
  }

  if (loading) {
    return (
      <div className="profile-loading-card">
        <LoaderCircle className="spin" size={24} />
        Đang tải hồ sơ...
      </div>
    );
  }

  if (!profile) {
    return (
      <section
        className={`profile-page-shell ${
          isHotelAdmin ? "hotel-admin-profile-shell" : ""
        }`}
      >
        <ErrorState
          title="Chưa thể hiển thị hồ sơ"
          message={error || "Hệ thống chưa cung cấp dữ liệu hồ sơ cho tài khoản này."}
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      </section>
    );
  }

  return (
    <section
      className={`profile-page-shell ${
        isHotelAdmin ? "hotel-admin-profile-shell" : ""
      }`}
    >
      <div className="profile-page-heading">
        <div>
          <span className="profile-page-kicker">
            <CircleUserRound size={17} />
            TÀI KHOẢN ENZIUROOMS
          </span>
          <h1>
            {isHotelAdmin
              ? "Hồ sơ đối tác"
              : "Hồ sơ của tôi"}
          </h1>
          <p>
            Quản lý thông tin cá nhân và ảnh đại diện dùng trên EnziuRooms.
          </p>
        </div>

        <span className="profile-role-pill">
          {isHotelAdmin ? <Hotel size={17} /> : <UserRound size={17} />}
          {displayRole}
        </span>
      </div>

      {error ? (
        <div className="profile-alert profile-alert-error">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="profile-alert profile-alert-success">
          <Check size={18} />
          {message}
        </div>
      ) : null}

      <div className="profile-layout-grid">
        <aside className="profile-side-column">
          <article className="profile-card profile-identity-card">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-large">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName ?? "Ảnh đại diện"}
                  />
                ) : (
                  <span>{avatarInitial}</span>
                )}
              </div>

              <button
                type="button"
                className="profile-avatar-edit"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarSaving}
                title="Đổi ảnh đại diện"
              >
                {avatarSaving ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Camera size={18} />
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleAvatarChange}
              />
            </div>

            <h2>{profile?.fullName ?? "Người dùng EnziuRooms"}</h2>
            <p className="profile-muted">{profile?.email}</p>

            <div className="profile-badge-row">
              <span className="profile-role-badge">{displayRole}</span>

              {profile?.emailVerified ? (
                <span className="profile-verified-badge">
                  <BadgeCheck size={15} />
                  Email đã xác minh
                </span>
              ) : null}
            </div>

            <div className="profile-avatar-actions">
              <button
                type="button"
                className="profile-secondary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarSaving}
              >
                <Camera size={17} />
                Đổi ảnh
              </button>

              {profile?.avatarUrl ? (
                <button
                  type="button"
                  className="profile-text-button danger"
                  onClick={handleRemoveAvatar}
                  disabled={avatarSaving}
                >
                  <ImageOff size={17} />
                  Xóa ảnh
                </button>
              ) : null}
            </div>

            <small className="profile-avatar-note">
              JPG, PNG hoặc WEBP. Dung lượng tối đa 5 MB.
            </small>

            <div className="profile-account-facts">
              <div>
                <CalendarDays size={18} />
                <span>
                  <small>Tham gia từ</small>
                  <strong>{formatDate(profile?.createdAt)}</strong>
                </span>
              </div>

              <div>
                <ShieldCheck size={18} />
                <div className="profile-account-fact-copy">
                  <small>Trạng thái tài khoản</small>
                  <StatusBadge
                    status={accountStatus}
                    label={accountStatusLabel(accountStatus)}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </article>

          {isHotelAdmin ? (
            <article className="profile-card partner-profile-card">
              <div className="profile-card-title-row">
                <div className="profile-title-icon teal">
                  <FileBadge2 size={20} />
                </div>
                <div>
                  <h3>Thông tin đối tác</h3>
                  <p>Thông tin đã đăng ký với EnziuRooms.</p>
                </div>
              </div>

              <div className="partner-status-line">
                <BadgeCheck size={18} />
                <span>{partnerStatusLabel(partner?.status)}</span>
              </div>

              <dl className="partner-profile-list">
                <div>
                  <dt>Tên pháp lý</dt>
                  <dd>{partner?.legalName ?? "Chưa có thông tin"}</dd>
                </div>
                <div>
                  <dt>Loại đối tác</dt>
                  <dd>{partnerTypeLabel(partner?.applicantType)}</dd>
                </div>
                <div>
                  <dt>Điện thoại kinh doanh</dt>
                  <dd>{partner?.businessPhone ?? "Chưa cập nhật"}</dd>
                </div>
                <div>
                  <dt>Khách sạn đang quản lý</dt>
                  <dd>{hotelCount}</dd>
                </div>
              </dl>
            </article>
          ) : null}
        </aside>

        <form className="profile-main-column" onSubmit={handleSave}>
          <article className="profile-card profile-form-card">
            <div className="profile-card-title-row">
              <div className="profile-title-icon">
                <UserRound size={20} />
              </div>
              <div>
                <h3>Thông tin cá nhân</h3>
                <p>Thông tin này giúp quá trình đặt và quản lý phòng thuận tiện hơn.</p>
              </div>
            </div>

            <div className="profile-form-grid">
              <label className="profile-field profile-field-full">
                <span>Họ và tên <b>*</b></span>
                <div className="profile-input-wrap">
                  <UserRound size={18} />
                  <input
                    name="fullName"
                    value={form.fullName}
                    onChange={changeField}
                    maxLength={150}
                    required
                    placeholder="Nhập họ và tên"
                  />
                </div>
              </label>

              <label className="profile-field">
                <span>Email</span>
                <div className="profile-input-wrap disabled">
                  <Mail size={18} />
                  <input value={profile?.email ?? ""} readOnly />
                </div>
                <small>Email đăng nhập không thay đổi tại đây.</small>
              </label>

              <label className="profile-field">
                <span>Số điện thoại</span>
                <div className="profile-input-wrap">
                  <Phone size={18} />
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={changeField}
                    maxLength={30}
                    placeholder="Ví dụ: 0901 234 567"
                  />
                </div>
              </label>

              <label className="profile-field">
                <span>Ngày sinh</span>
                <input
                  className="profile-plain-input"
                  type="date"
                  name="dateOfBirth"
                  value={form.dateOfBirth}
                  onChange={changeField}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>

              <label className="profile-field">
                <span>Giới tính</span>
                <select
                  className="profile-plain-input"
                  name="gender"
                  value={form.gender}
                  onChange={changeField}
                >
                  <option value="">Chưa chọn</option>
                  <option value="MALE">Nam</option>
                  <option value="FEMALE">Nữ</option>
                  <option value="OTHER">Khác</option>
                  <option value="PREFER_NOT_TO_SAY">Không muốn tiết lộ</option>
                </select>
              </label>

              <label className="profile-field">
                <span>Quốc tịch</span>
                <input
                  className="profile-plain-input"
                  name="nationality"
                  value={form.nationality}
                  onChange={changeField}
                  maxLength={80}
                  placeholder="Ví dụ: Việt Nam"
                />
              </label>

              <label className="profile-field">
                <span>Tỉnh / Thành phố</span>
                <div className="profile-input-wrap">
                  <MapPin size={18} />
                  <input
                    name="city"
                    value={form.city}
                    onChange={changeField}
                    maxLength={100}
                    placeholder="Ví dụ: TP. Hồ Chí Minh"
                  />
                </div>
              </label>

              <label className="profile-field profile-field-full">
                <span>Địa chỉ</span>
                <div className="profile-input-wrap">
                  <Building2 size={18} />
                  <input
                    name="address"
                    value={form.address}
                    onChange={changeField}
                    maxLength={255}
                    placeholder="Địa chỉ liên hệ"
                  />
                </div>
              </label>

              <label className="profile-field profile-field-full">
                <span>Giới thiệu</span>
                <textarea
                  name="bio"
                  value={form.bio}
                  onChange={changeField}
                  maxLength={500}
                  rows={5}
                  placeholder={
                    isHotelAdmin
                      ? "Một vài thông tin về bạn với vai trò quản lý khách sạn..."
                      : "Một vài thông tin về bạn..."
                  }
                />
                <small>{form.bio.length}/500 ký tự</small>
              </label>
            </div>
          </article>

          {isHotelAdmin && partner ? (
            <article className="profile-card profile-business-card">
              <div className="profile-card-title-row">
                <div className="profile-title-icon teal">
                  <Hotel size={20} />
                </div>
                <div>
                  <h3>Thông tin vận hành đối tác</h3>
                  <p>Thông tin đăng ký đối tác được quản lý riêng với hồ sơ cá nhân.</p>
                </div>
              </div>

              <div className="profile-business-grid">
                <div>
                  <Phone size={18} />
                  <span>
                    <small>Liên hệ kinh doanh</small>
                    <strong>{partner.businessPhone ?? "Chưa cập nhật"}</strong>
                  </span>
                </div>

                <div>
                  <MapPin size={18} />
                  <span>
                    <small>Địa chỉ kinh doanh</small>
                    <strong>{partner.businessAddress ?? "Chưa cập nhật"}</strong>
                  </span>
                </div>
              </div>

              <p className="profile-business-note">
                Thông tin đối tác đã được duyệt không thể chỉnh trực tiếp tại đây. Nếu cần thay đổi, hãy cập nhật qua hồ sơ đối tác.
              </p>
            </article>
          ) : null}

          <div className="profile-form-actions">
            <button
              type="button"
              className="profile-secondary-button"
              onClick={resetForm}
              disabled={saving}
            >
              Hoàn tác
            </button>

            <button
              type="submit"
              className="profile-primary-button"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
