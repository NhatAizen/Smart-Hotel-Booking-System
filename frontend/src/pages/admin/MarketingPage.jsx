import {
  Award,
  CalendarDays,
  Gift,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "../../components/ui";
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  createCampaign,
  createPlatformPromotion,
  getAdminCampaigns,
  getMembershipTiers,
  getPlatformPromotions,
  setCampaignActive,
  setPlatformPromotionActive,
  updateMembershipTier,
} from "../../services/promotionService";
import { statusLabel } from "../../utils/presentation";

import "../shared/PromotionCenter.css";
import "./MarketingPage.css";

const EMPTY_PROMOTION = Object.freeze({
  code: "",
  name: "",
  description: "",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscount: "",
  minBookingAmount: "",
  startAt: "",
  endAt: "",
  usageLimit: "",
  usagePerUser: "",
});

const EMPTY_CAMPAIGN = Object.freeze({
  name: "",
  title: "",
  description: "",
  badgeText: "",
  promotionId: "",
  startAt: "",
  endAt: "",
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

function requestErrorMessage(error, fallback) {
  const response = error?.response?.data;
  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? error?.message ?? fallback;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function finiteNumber(value) {
  if (!hasValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMoney(value) {
  const amount = finiteNumber(value);
  return amount === null
    ? "Chưa cập nhật"
    : `${amount.toLocaleString("vi-VN")} đ`;
}

function formatDateTime(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Chưa cập nhật"
    : dateFormatter.format(date);
}

function localDateTimeMin(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function promotionDiscount(promotion) {
  const amount = finiteNumber(promotion?.discountValue);
  if (amount === null) return "Chưa cập nhật mức giảm";

  return promotion.discountType === "PERCENT"
    ? `Giảm ${amount.toLocaleString("vi-VN")}%`
    : `Giảm ${formatMoney(amount)}`;
}

function promotionStatus(promotion) {
  if (promotion?.lifecycle) return promotion.lifecycle;
  return promotion?.active ? "ACTIVE" : "INACTIVE";
}

function validatePromotion(promotion) {
  const normalizedCode = promotion.code.trim().toUpperCase();
  const discountValue = finiteNumber(promotion.discountValue);
  const maxDiscount = finiteNumber(promotion.maxDiscount);
  const minBookingAmount = finiteNumber(promotion.minBookingAmount);
  const usageLimit = finiteNumber(promotion.usageLimit);
  const usagePerUser = finiteNumber(promotion.usagePerUser);
  const start = new Date(promotion.startAt);
  const end = new Date(promotion.endAt);

  if (!normalizedCode) return "Vui lòng nhập mã ưu đãi.";
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalizedCode)) {
    return "Mã ưu đãi cần 3–40 ký tự, chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.";
  }
  if (!promotion.name.trim()) return "Vui lòng nhập tên ưu đãi.";
  if (promotion.name.trim().length > 160) return "Tên ưu đãi tối đa 160 ký tự.";
  if (promotion.description.length > 600) return "Mô tả ưu đãi tối đa 600 ký tự.";
  if (discountValue === null || discountValue < 0.01) {
    return "Mức giảm phải từ 0,01 trở lên.";
  }
  if (promotion.discountType === "PERCENT" && discountValue > 100) {
    return "Mức giảm theo phần trăm không được vượt quá 100%.";
  }
  if (hasValue(promotion.maxDiscount) && (maxDiscount === null || maxDiscount < 0)) {
    return "Mức giảm tối đa không được âm.";
  }
  if (
    hasValue(promotion.minBookingAmount) &&
    (minBookingAmount === null || minBookingAmount < 0)
  ) {
    return "Giá trị đơn tối thiểu không được âm.";
  }
  if (
    hasValue(promotion.usageLimit) &&
    (usageLimit === null || !Number.isInteger(usageLimit) || usageLimit < 1)
  ) {
    return "Tổng lượt sử dụng phải là số nguyên từ 1 trở lên.";
  }
  if (
    hasValue(promotion.usagePerUser) &&
    (usagePerUser === null || !Number.isInteger(usagePerUser) || usagePerUser < 1)
  ) {
    return "Lượt dùng mỗi khách phải là số nguyên từ 1 trở lên.";
  }
  if (!promotion.startAt || Number.isNaN(start.getTime())) {
    return "Vui lòng chọn thời điểm bắt đầu hợp lệ.";
  }
  if (!promotion.endAt || Number.isNaN(end.getTime())) {
    return "Vui lòng chọn thời điểm kết thúc hợp lệ.";
  }
  if (start.getTime() < Date.now() - 60_000) {
    return "Thời điểm bắt đầu không được ở trong quá khứ.";
  }
  if (end <= start) return "Thời điểm kết thúc phải sau thời điểm bắt đầu.";

  return "";
}

function validateCampaign(campaign) {
  const start = new Date(campaign.startAt);
  const end = new Date(campaign.endAt);

  if (!campaign.name.trim()) return "Vui lòng nhập tên sự kiện.";
  if (campaign.name.trim().length > 160) return "Tên sự kiện tối đa 160 ký tự.";
  if (!campaign.title.trim()) return "Vui lòng nhập tiêu đề hiển thị.";
  if (campaign.title.trim().length > 220) return "Tiêu đề tối đa 220 ký tự.";
  if (campaign.description.length > 800) return "Mô tả sự kiện tối đa 800 ký tự.";
  if (campaign.badgeText.length > 80) return "Nhãn sự kiện tối đa 80 ký tự.";
  if (!campaign.startAt || Number.isNaN(start.getTime())) {
    return "Vui lòng chọn thời điểm bắt đầu hợp lệ cho sự kiện.";
  }
  if (!campaign.endAt || Number.isNaN(end.getTime())) {
    return "Vui lòng chọn thời điểm kết thúc hợp lệ cho sự kiện.";
  }
  if (start.getTime() < Date.now() - 60_000) {
    return "Thời điểm bắt đầu sự kiện không được ở trong quá khứ.";
  }
  if (end <= start) return "Thời điểm kết thúc sự kiện phải sau thời điểm bắt đầu.";

  return "";
}

function validateTier(tier) {
  const bookings = finiteNumber(tier.minCompletedBookings);
  const discount = finiteNumber(tier.discountPercent);

  if (bookings === null || !Number.isInteger(bookings) || bookings < 0) {
    return "Số đơn đặt phòng tối thiểu phải là số nguyên không âm.";
  }
  if (discount === null || discount < 0 || discount > 30) {
    return "Mức giảm thành viên phải nằm trong khoảng 0–30%.";
  }

  return "";
}

export default function MarketingPage() {
  const { subscribe } = useRealtime();
  const [promos, setPromos] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [promo, setPromo] = useState({ ...EMPTY_PROMOTION });
  const [campaign, setCampaign] = useState({ ...EMPTY_CAMPAIGN });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef("");

  const load = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const [promotionData, campaignData, tierData] = await Promise.all([
        getPlatformPromotions(),
        getAdminCampaigns(),
        getMembershipTiers(),
      ]);
      setPromos(Array.isArray(promotionData) ? promotionData : []);
      setCampaigns(Array.isArray(campaignData) ? campaignData : []);
      setTiers(Array.isArray(tierData) ? tierData : []);
    } catch (requestError) {
      setError(
        requestErrorMessage(requestError, "Không thể tải trung tâm ưu đãi."),
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ showLoading: true });
  }, [load]);

  useEffect(() => {
    const refresh = () => load();
    const unsubscribers = [
      subscribe("PLATFORM_PROMOTION_CREATED", refresh),
      subscribe("PROMOTION_STATUS_CHANGED", refresh),
      subscribe("CAMPAIGN_CREATED", refresh),
      subscribe("CAMPAIGN_STATUS_CHANGED", refresh),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, [load, subscribe]);

  function beginAction(key) {
    if (busyRef.current) return false;
    busyRef.current = key;
    setBusyKey(key);
    setError("");
    setMessage("");
    return true;
  }

  function finishAction() {
    busyRef.current = "";
    setBusyKey("");
  }

  function changeForm(setter) {
    return (event) => {
      const { name, value } = event.target;
      setter((current) => ({ ...current, [name]: value }));
    };
  }

  async function submitPromotion(event) {
    event.preventDefault();

    const validationError = validatePromotion(promo);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    if (!beginAction("create-promotion")) return;

    try {
      await createPlatformPromotion({
        ...promo,
        hotelId: null,
        discountValue: Number(promo.discountValue),
        maxDiscount: promo.maxDiscount ? Number(promo.maxDiscount) : null,
        minBookingAmount: Number(promo.minBookingAmount || 0),
        usageLimit: promo.usageLimit ? Number(promo.usageLimit) : null,
        usagePerUser: promo.usagePerUser ? Number(promo.usagePerUser) : null,
        startAt: new Date(promo.startAt).toISOString(),
        endAt: new Date(promo.endAt).toISOString(),
      });
      setPromo({ ...EMPTY_PROMOTION });
      setMessage("Đã tạo mã ưu đãi EnziuRooms.");
      await load();
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "Không thể tạo mã ưu đãi."));
    } finally {
      finishAction();
    }
  }

  async function submitCampaign(event) {
    event.preventDefault();

    const validationError = validateCampaign(campaign);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    if (!beginAction("create-campaign")) return;

    try {
      await createCampaign({
        ...campaign,
        promotionId: campaign.promotionId || null,
        startAt: new Date(campaign.startAt).toISOString(),
        endAt: new Date(campaign.endAt).toISOString(),
      });
      setCampaign({ ...EMPTY_CAMPAIGN });
      setMessage("Đã tạo sự kiện.");
      await load();
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "Không thể tạo sự kiện."));
    } finally {
      finishAction();
    }
  }

  async function saveTier(tier) {
    const validationError = validateTier(tier);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    if (!beginAction(`tier-${tier.level}`)) return;

    try {
      await updateMembershipTier(tier.level, {
        minCompletedBookings: Number(tier.minCompletedBookings),
        discountPercent: Number(tier.discountPercent),
        active: tier.active,
      });
      setMessage(`Đã cập nhật ${tier.name || tier.level}.`);
      await load();
    } catch (requestError) {
      setError(
        requestErrorMessage(requestError, "Không thể cập nhật cấp thành viên."),
      );
    } finally {
      finishAction();
    }
  }

  async function togglePromotion(promotion) {
    if (!beginAction(`promotion-${promotion.id}`)) return;

    try {
      await setPlatformPromotionActive(promotion.id, !promotion.active);
      setMessage(
        promotion.active ? "Đã tạm dừng mã ưu đãi." : "Đã bật mã ưu đãi.",
      );
      await load();
    } catch (requestError) {
      setError(
        requestErrorMessage(requestError, "Không thể đổi trạng thái mã ưu đãi."),
      );
    } finally {
      finishAction();
    }
  }

  async function toggleCampaign(item) {
    if (!beginAction(`campaign-${item.id}`)) return;

    try {
      await setCampaignActive(item.id, !item.active);
      setMessage(item.active ? "Đã tạm dừng sự kiện." : "Đã bật sự kiện.");
      await load();
    } catch (requestError) {
      setError(
        requestErrorMessage(requestError, "Không thể đổi trạng thái sự kiện."),
      );
    } finally {
      finishAction();
    }
  }

  function updateTier(level, field, value) {
    setTiers((current) =>
      current.map((tier) =>
        tier.level === level ? { ...tier, [field]: value } : tier,
      ),
    );
  }

  if (loading) {
    return <LoadingState message="Đang tải ưu đãi và cấp thành viên..." />;
  }

  return (
    <div className="promo-page system-marketing-page">
      <div className="promo-hero system-marketing-page__hero">
        <div>
          <span className="promo-kicker">KINH DOANH</span>
          <h1>Ưu đãi & thành viên</h1>
          <p>
            Quản lý hạng thành viên, mã giảm giá và sự kiện hiển thị trên
            EnziuRooms từ một không gian quản trị thống nhất.
          </p>
        </div>
        <button
          type="button"
          className="promo-secondary system-marketing-page__refresh"
          onClick={() => load({ showLoading: true })}
          disabled={Boolean(busyKey)}
        >
          <RefreshCw size={17} aria-hidden="true" />
          Làm mới
        </button>
      </div>

      {message ? (
        <div className="promo-message" role="status">{message}</div>
      ) : null}
      <ErrorState
        message={error}
        onRetry={() => load({ showLoading: true })}
        compact
      />

      <section className="promo-table-card system-marketing-page__tiers">
        <div className="system-marketing-page__section-heading">
          <div>
            <h2><Award size={20} aria-hidden="true" /> Cấp thành viên</h2>
            <p>Ngưỡng đơn hoàn tất và quyền lợi đang áp dụng cho từng hạng.</p>
          </div>
        </div>

        {tiers.length === 0 ? (
          <EmptyState
            compact
            icon={<Award size={24} />}
            title="Chưa có cấp thành viên"
            description="Các hạng thành viên sẽ hiển thị tại đây sau khi được thiết lập."
          />
        ) : (
          <div className="system-marketing-page__tier-list">
            {tiers.map((tier) => {
              const tierBusy = busyKey === `tier-${tier.level}`;
              return (
                <div className="tier-row" key={tier.level}>
                  <div className="system-marketing-page__tier-name">
                    <strong>{tier.name || tier.level}</strong>
                    <StatusBadge
                      status={tier.active ? "ACTIVE" : "INACTIVE"}
                      size="sm"
                    />
                  </div>
                  <label>
                    Booking hoàn tất tối thiểu
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={tier.minCompletedBookings ?? ""}
                      onChange={(event) =>
                        updateTier(tier.level, "minCompletedBookings", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Giảm giá (%)
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.01"
                      value={tier.discountPercent ?? ""}
                      onChange={(event) =>
                        updateTier(tier.level, "discountPercent", event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="promo-secondary"
                    onClick={() => saveTier(tier)}
                    disabled={Boolean(busyKey)}
                    aria-busy={tierBusy || undefined}
                  >
                    {tierBusy ? "Đang lưu..." : "Lưu thay đổi"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="promo-two-col system-marketing-page__columns">
        <section className="promo-form-card system-marketing-page__panel">
          <div className="system-marketing-page__section-heading">
            <div>
              <h2><Gift size={19} aria-hidden="true" /> Mã toàn hệ thống</h2>
              <p>Tạo mã khi đã xác định đủ điều kiện, hạn dùng và giới hạn.</p>
            </div>
          </div>

          <form className="promo-form" onSubmit={submitPromotion}>
            <label>
              Mã ưu đãi
              <input
                name="code"
                value={promo.code}
                onChange={changeForm(setPromo)}
                maxLength={40}
                autoComplete="off"
                placeholder="Nhập mã ưu đãi"
                required
              />
            </label>
            <label>
              Kiểu giảm
              <select
                name="discountType"
                value={promo.discountType}
                onChange={changeForm(setPromo)}
              >
                <option value="PERCENT">Theo phần trăm</option>
                <option value="FIXED">Theo số tiền</option>
              </select>
            </label>
            <label className="full">
              Tên ưu đãi
              <input
                name="name"
                value={promo.name}
                onChange={changeForm(setPromo)}
                maxLength={160}
                required
              />
            </label>
            <label className="full">
              Mô tả
              <textarea
                name="description"
                value={promo.description}
                onChange={changeForm(setPromo)}
                maxLength={600}
              />
            </label>
            <label>
              Mức giảm
              <input
                name="discountValue"
                type="number"
                min="0.01"
                max={promo.discountType === "PERCENT" ? "100" : undefined}
                step="0.01"
                value={promo.discountValue}
                onChange={changeForm(setPromo)}
                required
              />
            </label>
            <label>
              Giảm tối đa
              <input
                name="maxDiscount"
                type="number"
                min="0"
                step="0.01"
                value={promo.maxDiscount}
                onChange={changeForm(setPromo)}
              />
            </label>
            <label>
              Đơn tối thiểu
              <input
                name="minBookingAmount"
                type="number"
                min="0"
                step="0.01"
                value={promo.minBookingAmount}
                onChange={changeForm(setPromo)}
              />
            </label>
            <label>
              Tổng lượt sử dụng
              <input
                name="usageLimit"
                type="number"
                min="1"
                step="1"
                value={promo.usageLimit}
                onChange={changeForm(setPromo)}
              />
            </label>
            <label>
              Lượt dùng mỗi khách
              <input
                name="usagePerUser"
                type="number"
                min="1"
                step="1"
                value={promo.usagePerUser}
                onChange={changeForm(setPromo)}
              />
            </label>
            <span className="system-marketing-page__form-spacer" aria-hidden="true" />
            <label>
              Bắt đầu
              <input
                name="startAt"
                type="datetime-local"
                value={promo.startAt}
                min={localDateTimeMin()}
                onChange={changeForm(setPromo)}
                required
              />
            </label>
            <label>
              Kết thúc
              <input
                name="endAt"
                type="datetime-local"
                value={promo.endAt}
                min={promo.startAt || localDateTimeMin()}
                onChange={changeForm(setPromo)}
                required
              />
            </label>
            <button
              type="submit"
              className="promo-primary full"
              disabled={Boolean(busyKey)}
              aria-busy={busyKey === "create-promotion" || undefined}
            >
              {busyKey === "create-promotion" ? "Đang tạo mã..." : "Tạo mã ưu đãi"}
            </button>
          </form>

          <div className="promo-list system-marketing-page__list">
            {promos.length === 0 ? (
              <EmptyState
                compact
                icon={<Gift size={23} />}
                title="Chưa có mã toàn hệ thống"
                description="Tạo mã ưu đãi đầu tiên để bắt đầu chương trình khuyến mãi toàn hệ thống."
              />
            ) : promos.map((promotion) => {
              const status = promotionStatus(promotion);
              const itemBusy = busyKey === `promotion-${promotion.id}`;
              return (
                <article className="promo-item system-marketing-page__item" key={promotion.id}>
                  <div className="system-marketing-page__item-copy">
                    <div className="system-marketing-page__item-title">
                      <span className="promo-code">{promotion.code}</span>
                      <StatusBadge
                        status={status}
                        label={statusLabel(status)}
                        size="sm"
                      />
                    </div>
                    <strong>{promotion.name}</strong>
                    {promotion.description ? <p>{promotion.description}</p> : null}
                    <dl className="system-marketing-page__facts">
                      <div><dt>Quyền lợi</dt><dd>{promotionDiscount(promotion)}</dd></div>
                      <div><dt>Đơn tối thiểu</dt><dd>{formatMoney(promotion.minBookingAmount)}</dd></div>
                      <div>
                        <dt>Lượt sử dụng</dt>
                        <dd>
                          {hasValue(promotion.usedCount)
                            ? promotion.usedCount
                            : "Chưa cập nhật"}
                          {hasValue(promotion.usageLimit)
                            ? ` / ${promotion.usageLimit}`
                            : " / Không giới hạn"}
                        </dd>
                      </div>
                      <div>
                        <dt>Thời hạn</dt>
                        <dd>{formatDateTime(promotion.startAt)} – {formatDateTime(promotion.endAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    className="promo-secondary"
                    onClick={() => togglePromotion(promotion)}
                    disabled={Boolean(busyKey)}
                    aria-busy={itemBusy || undefined}
                  >
                    {itemBusy
                      ? "Đang xử lý..."
                      : promotion.active
                        ? "Tạm dừng"
                        : "Bật mã"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="promo-form-card system-marketing-page__panel">
          <div className="system-marketing-page__section-heading">
            <div>
              <h2><Sparkles size={19} aria-hidden="true" /> Sự kiện</h2>
              <p>Thiết lập nội dung và thời gian hiển thị trên nền tảng.</p>
            </div>
          </div>

          <form className="promo-form" onSubmit={submitCampaign}>
            <label className="full">
              Tên sự kiện
              <input
                name="name"
                value={campaign.name}
                onChange={changeForm(setCampaign)}
                maxLength={160}
                required
              />
            </label>
            <label className="full">
              Tiêu đề hiển thị
              <input
                name="title"
                value={campaign.title}
                onChange={changeForm(setCampaign)}
                maxLength={220}
                required
              />
            </label>
            <label>
              Mã đi kèm
              <select
                name="promotionId"
                value={campaign.promotionId}
                onChange={changeForm(setCampaign)}
              >
                <option value="">Không gắn mã</option>
                {promos.map((promotion) => (
                  <option value={promotion.id} key={promotion.id}>
                    {promotion.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nhãn hiển thị
              <input
                name="badgeText"
                value={campaign.badgeText}
                onChange={changeForm(setCampaign)}
                maxLength={80}
              />
            </label>
            <label>
              Bắt đầu
              <input
                name="startAt"
                type="datetime-local"
                value={campaign.startAt}
                min={localDateTimeMin()}
                onChange={changeForm(setCampaign)}
                required
              />
            </label>
            <label>
              Kết thúc
              <input
                name="endAt"
                type="datetime-local"
                value={campaign.endAt}
                min={campaign.startAt || localDateTimeMin()}
                onChange={changeForm(setCampaign)}
                required
              />
            </label>
            <label className="full">
              Mô tả
              <textarea
                name="description"
                value={campaign.description}
                onChange={changeForm(setCampaign)}
                maxLength={800}
              />
            </label>
            <button
              type="submit"
              className="promo-primary full"
              disabled={Boolean(busyKey)}
              aria-busy={busyKey === "create-campaign" || undefined}
            >
              {busyKey === "create-campaign" ? "Đang tạo sự kiện..." : "Tạo sự kiện"}
            </button>
          </form>

          <div className="promo-list system-marketing-page__list">
            {campaigns.length === 0 ? (
              <EmptyState
                compact
                icon={<CalendarDays size={23} />}
                title="Chưa có sự kiện"
                description="Tạo sự kiện đầu tiên để hiển thị nội dung theo lịch trên EnziuRooms."
              />
            ) : campaigns.map((item) => {
              const itemBusy = busyKey === `campaign-${item.id}`;
              return (
                <article className="promo-item system-marketing-page__item" key={item.id}>
                  <div className="system-marketing-page__item-copy">
                    <div className="system-marketing-page__item-title">
                      {item.badgeText ? (
                        <span className="promo-code">{item.badgeText}</span>
                      ) : null}
                      <StatusBadge
                        status={item.active ? "ACTIVE" : "INACTIVE"}
                        label={item.active ? "Đang bật" : "Đang tắt"}
                        size="sm"
                      />
                      {item.visibleNow ? (
                        <StatusBadge status="ACTIVE" label="Đang hiển thị" size="sm" />
                      ) : null}
                    </div>
                    <strong>{item.title}</strong>
                    <small>{item.name}</small>
                    {item.description ? <p>{item.description}</p> : null}
                    <dl className="system-marketing-page__facts">
                      <div>
                        <dt>Mã đi kèm</dt>
                        <dd>{item.promotionCode || "Không gắn mã"}</dd>
                      </div>
                      <div>
                        <dt>Thời gian</dt>
                        <dd>{formatDateTime(item.startAt)} – {formatDateTime(item.endAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    className="promo-secondary"
                    onClick={() => toggleCampaign(item)}
                    disabled={Boolean(busyKey)}
                    aria-busy={itemBusy || undefined}
                  >
                    {itemBusy
                      ? "Đang xử lý..."
                      : item.active
                        ? "Tạm dừng"
                        : "Bật sự kiện"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
