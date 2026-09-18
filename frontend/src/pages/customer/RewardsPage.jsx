import {
  Award,
  Bookmark,
  Check,
  Gift,
  LockKeyhole,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, StatusBadge } from "../../components/ui";
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  getActiveCampaigns,
  getMembershipLevels,
  getMembershipProfile,
  getSavedPromotions,
  removeSavedPromotion,
  savePromotion,
} from "../../services/promotionService";
import { normalizeEnum, STATUS_LABELS } from "../../utils/presentation";
import "../shared/PromotionCenter.css";
import "./RewardsPage.css";

function money(value) {
  if (value === null || value === undefined || value === "") return "Chưa cập nhật";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} ₫` : "Chưa cập nhật";
}

function discountLabel(promotion) {
  if (promotion?.discountValue == null) return "Mức giảm chưa được cập nhật";
  if (String(promotion?.discountType).toUpperCase() === "PERCENT") {
    return `Giảm ${Number(promotion.discountValue)}%`;
  }
  return `Giảm ${money(promotion.discountValue)}`;
}

function dateLabel(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function lifecycleLabel(value) {
  const normalized = normalizeEnum(value);
  if (normalized === "ACTIVE") return "Có thể sử dụng";
  return STATUS_LABELS[normalized] ?? "Chưa xác định";
}

export default function RewardsPage() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const benefitsRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [savedPromotions, setSavedPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, campaignData, tierData, savedData] = await Promise.all([
        getMembershipProfile(),
        getActiveCampaigns(),
        getMembershipLevels(),
        getSavedPromotions(),
      ]);

      setProfile(profileData);
      setCampaigns(Array.isArray(campaignData) ? campaignData : []);
      setTiers(Array.isArray(tierData) ? tierData : []);
      setSavedPromotions(Array.isArray(savedData) ? savedData : []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải chương trình thành viên lúc này.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    const unsubscribers = [
      subscribe("CAMPAIGN_CREATED", refresh),
      subscribe("CAMPAIGN_STATUS_CHANGED", refresh),
      subscribe("PROMOTION_STATUS_CHANGED", refresh),
      subscribe("PLATFORM_PROMOTION_CREATED", refresh),
      subscribe("HOTEL_PROMOTION_CREATED", refresh),
      subscribe("BOOKING_STATUS_CHANGED", refresh),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [load, subscribe]);

  const savedIds = useMemo(
    () => new Set(savedPromotions.map((promotion) => String(promotion.id))),
    [savedPromotions],
  );

  const currentLevel = profile?.level == null ? null : Number(profile.level);
  const completedBookings = profile?.completedBookings == null
    ? null
    : Number(profile.completedBookings);
  const currentTier = Number.isFinite(currentLevel)
    ? tiers.find((tier) => Number(tier.level) === currentLevel) ?? null
    : null;
  const nextTier = Number.isFinite(currentLevel)
    ? tiers.find((tier) => Number(tier.level) === currentLevel + 1) ?? null
    : null;
  const nextThreshold = nextTier?.minCompletedBookings == null
    ? null
    : Number(nextTier.minCompletedBookings);
  const currentThreshold = currentTier?.minCompletedBookings == null
    ? null
    : Number(currentTier.minCompletedBookings);

  const progress = useMemo(() => {
    if (!nextTier || !Number.isFinite(completedBookings)
      || !Number.isFinite(currentThreshold) || !Number.isFinite(nextThreshold)) return null;
    return Math.max(
      0,
      Math.min(
        100,
        ((completedBookings - currentThreshold)
          / Math.max(1, Number(nextThreshold) - Number(currentThreshold))) * 100,
      ),
    );
  }, [completedBookings, currentThreshold, nextThreshold, nextTier]);

  const progressDots = useMemo(() => {
    if (!nextTier || !Number.isFinite(completedBookings)
      || !Number.isFinite(currentThreshold) || !Number.isFinite(nextThreshold)) return [];
    const total = Math.max(1, Number(nextThreshold) - Number(currentThreshold));
    const done = Math.max(0, Math.min(total, completedBookings - Number(currentThreshold)));
    return Array.from({ length: Math.min(total, 15) }, (_, index) => index < done);
  }, [completedBookings, currentThreshold, nextThreshold, nextTier]);

  async function handleSaveCampaign(campaign) {
    if (!campaign?.promotionId || savedIds.has(String(campaign.promotionId))) return;
    setBusyId(String(campaign.promotionId));
    setMessage("");
    setError("");

    try {
      const saved = await savePromotion(campaign.promotionId);
      setSavedPromotions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setMessage(`Đã lưu mã ${saved.code}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể lưu mã lúc này.");
    } finally {
      setBusyId("");
    }
  }

  async function handleRemove(promotion) {
    setBusyId(String(promotion.id));
    setMessage("");
    setError("");

    try {
      await removeSavedPromotion(promotion.id);
      setSavedPromotions((current) => current.filter((item) => item.id !== promotion.id));
      setMessage(`Đã bỏ lưu mã ${promotion.code}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể bỏ lưu mã lúc này.");
    } finally {
      setBusyId("");
    }
  }

  const firstName = String(user?.fullName ?? "").trim().split(/\s+/).pop() || "bạn";

  if (loading && !profile && tiers.length === 0) {
    return <Loading message="Đang tải chương trình thành viên..." />;
  }

  return (
    <main className="customer-page-shell enziu-loyalty-page">
      <section className="enziu-loyalty-hero">
        <div className="container">
          <div className="enziu-loyalty-hero-copy">
            <span className="enziu-loyalty-eyebrow">
              <Sparkles size={17} />
              Thành viên EnziuRooms
            </span>
            <p>Mỗi chuyến đi đều đáng giá</p>
            <h1>Chương trình khách hàng thân thiết Enziu</h1>
            <span>
              Hoàn tất chuyến đi để nâng cấp thành viên và mở khóa mức giá tốt hơn cho những lần đặt phòng tiếp theo.
            </span>
          </div>
        </div>
      </section>

      <div className="container enziu-loyalty-content">
        {message ? <div className="promo-message">{message}</div> : null}
        <ErrorMessage message={error} onRetry={() => void load()} />

        {profile && Number.isFinite(currentLevel) ? (
          <section className="enziu-level-progress-card">
          <div className="enziu-level-title">
            <span className="enziu-level-number">{currentLevel}</span>
            <div>
              <small>Hạng hiện tại</small>
              <h2>{firstName} ơi, bạn đang ở {profile.name || `Cấp ${currentLevel}`}!</h2>
              <p>
                {tiers.length === 0
                  ? "Chưa xác định được hạng tiếp theo."
                  : nextTier
                  ? (profile.bookingsToNextLevel != null
                    ? `Hoàn tất thêm ${Number(profile.bookingsToNextLevel)} đơn đặt phòng để mở khóa ${profile.nextName || nextTier.name}.`
                    : `Tiếp tục hoàn tất chuyến đi để mở khóa ${profile.nextName || nextTier.name}.`)
                  : "Bạn đã đạt cấp thành viên cao nhất hiện tại."}
              </p>
            </div>
          </div>

          {tiers.length === 0 ? (
            <div className="enziu-highest-level">
              <Award size={22} />
              Tiến độ hạng thành viên hiện chưa sẵn sàng.
            </div>
          ) : nextTier ? (
            <>
              <div className="enziu-progress-dots" aria-label={`Tiến độ lên ${nextTier.name}`}>
                {progressDots.map((done, index) => (
                  <span key={index} className={done ? "done" : ""}>
                    {done ? <Check size={18} /> : index + 1}
                  </span>
                ))}
              </div>
              {progress != null ? (
                <div
                  className="enziu-progress-track"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={Math.round(progress)}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              ) : null}
            </>
          ) : (
            <div className="enziu-highest-level">
              <Trophy size={22} />
              Bạn đang tận hưởng quyền lợi thành viên cao nhất.
            </div>
          )}

          <button
            type="button"
            className="enziu-how-to-level"
            onClick={() => benefitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Xem quyền lợi từng cấp
          </button>
          </section>
        ) : (
          <EmptyState
            icon={<Award size={28} />}
            title={error ? "Chưa thể hiển thị hạng thành viên" : "Chưa có thông tin hạng thành viên"}
            description={error
              ? "Dữ liệu thành viên chưa tải được. Hãy thử lại khi kết nối ổn định."
              : "Thông tin hạng thành viên chưa sẵn sàng. Vui lòng thử lại sau."}
          />
        )}

        <section ref={benefitsRef} className="enziu-loyalty-benefits">
          <div className="enziu-loyalty-section-heading">
            <span>QUYỀN LỢI THÀNH VIÊN</span>
            <h2>Tiết kiệm hơn cho chuyến đi tiếp theo</h2>
            <p>
              Mức giảm theo hạng được tự động tính khi bạn đặt phòng. Không cần nhập mã cho quyền lợi thành viên.
            </p>
          </div>

          {tiers.length > 0 ? <div className="enziu-tier-grid">
            {tiers.map((tier) => {
              const level = Number(tier.level);
              const current = Number.isFinite(currentLevel) && level === currentLevel;
              const unlocked = Number.isFinite(currentLevel) && currentLevel >= level;

              return (
                <article
                  key={level}
                  className={`enziu-tier-card ${current ? "current" : ""} ${unlocked ? "unlocked" : "locked"}`}
                >
                  <div className="enziu-tier-pill">
                    {unlocked ? <Award size={16} /> : <LockKeyhole size={16} />}
                    {tier.name}
                  </div>
                  <strong>
                    {tier.discountPercent == null
                      ? "Mức giảm chưa được cập nhật"
                      : `Giảm ${Number(tier.discountPercent)}% khi đặt phòng`}
                  </strong>
                  <p>
                    {level === 1
                      ? "Quyền lợi bắt đầu ngay khi bạn là thành viên EnziuRooms."
                      : (tier.minCompletedBookings == null
                        ? "Điều kiện mở khóa chưa được cập nhật."
                        : `Mở khóa từ ${Number(tier.minCompletedBookings)} đơn đặt phòng đã hoàn tất.`)}
                  </p>
                  <div className="enziu-tier-rule">
                    <Check size={17} />
                    Tự động áp dụng cho đơn đủ điều kiện
                  </div>
                  {current ? <span className="enziu-current-tier-label">Cấp của bạn</span> : null}
                </article>
              );
            })}
          </div> : (
            <EmptyState
              icon={<Trophy size={28} />}
              title={error ? "Chưa thể hiển thị quyền lợi" : "Chưa có thông tin quyền lợi"}
              description={error
                ? "Dữ liệu quyền lợi chưa tải được. Hãy thử lại khi kết nối ổn định."
                : "Các hạng và quyền lợi hiện chưa được thiết lập."}
              compact
            />
          )}
        </section>

        <section className="enziu-loyalty-vouchers">
          <div className="enziu-loyalty-section-heading">
            <span>MÃ CỦA BẠN</span>
            <h2>Voucher đã lưu</h2>
            <p>Mã từ khách sạn và sự kiện EnziuRooms được lưu tại đây để bạn dùng lại khi checkout.</p>
          </div>

          {savedPromotions.length > 0 ? (
            <div className="saved-voucher-grid">
              {savedPromotions.map((promotion) => (
                <article className="saved-voucher-card" key={promotion.id}>
                  <div>
                    <span className="promo-code">{promotion.code}</span>
                    <h3>{promotion.name}</h3>
                    <p>{discountLabel(promotion)}</p>
                    <small>
                      {String(promotion.scope).toUpperCase() === "HOTEL"
                        ? "Ưu đãi của khách sạn"
                        : String(promotion.scope).toUpperCase() === "PLATFORM"
                          ? "Ưu đãi EnziuRooms"
                          : "Phạm vi chưa xác định"}
                    </small>
                    <small>Hạn dùng: {dateLabel(promotion.endAt)}</small>
                    <StatusBadge
                      status={promotion.lifecycle}
                      label={lifecycleLabel(promotion.lifecycle)}
                      size="sm"
                    />
                    {Number(promotion.minBookingAmount ?? 0) > 0 ? (
                      <small>Đơn tối thiểu: {money(promotion.minBookingAmount)}</small>
                    ) : null}
                  </div>

                  <div className="saved-voucher-actions">
                    <Gift size={22} />
                    <button
                      type="button"
                      className="saved-voucher-remove"
                      disabled={busyId === String(promotion.id)}
                      onClick={() => handleRemove(promotion)}
                    >
                      <Trash2 size={14} /> Bỏ lưu
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="promo-card">
              <Bookmark size={24} />
              <h3>Chưa lưu voucher nào</h3>
              <p>Vào trang khách sạn hoặc sự kiện đang diễn ra để lưu mã phù hợp.</p>
            </div>
          )}
        </section>

        {campaigns.length > 0 ? (
          <section className="enziu-loyalty-campaigns">
            <div className="enziu-loyalty-section-heading">
              <span>ĐANG DIỄN RA</span>
              <h2>Ưu đãi dành cho thành viên</h2>
            </div>

            <div className="promo-list">
              {campaigns.map((campaign) => {
                const saved = campaign.promotionId
                  ? savedIds.has(String(campaign.promotionId))
                  : false;

                return (
                  <article className="promo-item" key={campaign.id}>
                    <div>
                      <span className="promo-status active">{campaign.label || "ƯU ĐÃI"}</span>
                      <h3>{campaign.displayTitle || campaign.name}</h3>
                      <p>{campaign.description}</p>
                      {campaign.promotionCode ? (
                        <span className="promo-code">{campaign.promotionCode}</span>
                      ) : null}
                    </div>

                    <div className="campaign-actions">
                      <Tag size={24} />
                      {campaign.promotionId ? (
                        <button
                          type="button"
                          className={`promo-secondary ${saved ? "saved" : ""}`}
                          disabled={saved || busyId === String(campaign.promotionId)}
                          onClick={() => handleSaveCampaign(campaign)}
                        >
                          {saved ? "Đã lưu" : "Lưu mã"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
