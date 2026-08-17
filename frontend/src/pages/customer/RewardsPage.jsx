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
import { useRealtime } from "../../realtime/RealtimeContext";
import {
  getActiveCampaigns,
  getMembershipLevels,
  getMembershipProfile,
  getSavedPromotions,
  removeSavedPromotion,
  savePromotion,
} from "../../services/promotionService";
import "../shared/PromotionCenter.css";
import "./RewardsPage.css";

const fallbackTiers = [
  { level: 1, name: "Cấp 1", minCompletedBookings: 0, discountPercent: 2 },
  { level: 2, name: "Cấp 2", minCompletedBookings: 5, discountPercent: 5 },
  { level: 3, name: "Cấp 3", minCompletedBookings: 15, discountPercent: 8 },
];

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function discountLabel(promotion) {
  if (String(promotion?.discountType).toUpperCase() === "PERCENT") {
    return `Giảm ${Number(promotion?.discountValue ?? 0)}%`;
  }
  return `Giảm ${money(promotion?.discountValue)}`;
}

function dateLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function lifecycleLabel(value) {
  return {
    ACTIVE: "Có thể sử dụng",
    EXPIRED: "Đã hết hạn",
    EXHAUSTED: "Đã hết lượt",
    SCHEDULED: "Sắp diễn ra",
  }[value] ?? "Tạm dừng";
}

export default function RewardsPage() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const benefitsRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [tiers, setTiers] = useState(fallbackTiers);
  const [savedPromotions, setSavedPromotions] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [profileData, campaignData, tierData, savedData] = await Promise.all([
        getMembershipProfile(),
        getActiveCampaigns(),
        getMembershipLevels(),
        getSavedPromotions(),
      ]);

      setProfile(profileData);
      setCampaigns(Array.isArray(campaignData) ? campaignData : []);
      setTiers(Array.isArray(tierData) && tierData.length ? tierData : fallbackTiers);
      setSavedPromotions(Array.isArray(savedData) ? savedData : []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải chương trình thành viên lúc này.");
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

  const currentLevel = Number(profile?.level ?? 1);
  const completedBookings = Number(profile?.completedBookings ?? 0);
  const currentTier = tiers.find((tier) => Number(tier.level) === currentLevel) ?? tiers[0];
  const nextTier = tiers.find((tier) => Number(tier.level) === currentLevel + 1) ?? null;
  const nextThreshold = nextTier?.minCompletedBookings ?? currentTier?.minCompletedBookings ?? completedBookings;
  const currentThreshold = currentTier?.minCompletedBookings ?? 0;

  const progress = useMemo(() => {
    if (!nextTier) return 100;
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
    if (!nextTier) return [];
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
        {error ? <div className="promo-message error">{error}</div> : null}

        <section className="enziu-level-progress-card">
          <div className="enziu-level-title">
            <span className="enziu-level-number">{currentLevel}</span>
            <div>
              <small>Hạng hiện tại</small>
              <h2>{firstName} ơi, bạn đang ở {profile?.name ?? `Cấp ${currentLevel}`}!</h2>
              <p>
                {nextTier
                  ? `Hoàn tất ${Number(profile?.bookingsToNextLevel ?? 0)} booking nữa để mở khóa ${profile?.nextName ?? nextTier.name}.`
                  : "Bạn đã đạt cấp thành viên cao nhất hiện tại."}
              </p>
            </div>
          </div>

          {nextTier ? (
            <>
              <div className="enziu-progress-dots" aria-label={`Tiến độ lên ${nextTier.name}`}>
                {progressDots.map((done, index) => (
                  <span key={index} className={done ? "done" : ""}>
                    {done ? <Check size={18} /> : index + 1}
                  </span>
                ))}
              </div>
              <div className="enziu-progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
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

        <section ref={benefitsRef} className="enziu-loyalty-benefits">
          <div className="enziu-loyalty-section-heading">
            <span>QUYỀN LỢI THÀNH VIÊN</span>
            <h2>Tiết kiệm hơn cho chuyến đi tiếp theo</h2>
            <p>
              Mức giảm theo hạng được tự động tính khi bạn đặt phòng. Không cần nhập mã cho quyền lợi thành viên.
            </p>
          </div>

          <div className="enziu-tier-grid">
            {tiers.map((tier) => {
              const level = Number(tier.level);
              const current = level === currentLevel;
              const unlocked = currentLevel >= level;

              return (
                <article
                  key={level}
                  className={`enziu-tier-card ${current ? "current" : ""} ${unlocked ? "unlocked" : "locked"}`}
                >
                  <div className="enziu-tier-pill">
                    {unlocked ? <Award size={16} /> : <LockKeyhole size={16} />}
                    {tier.name}
                  </div>
                  <strong>Giảm {Number(tier.discountPercent ?? 0)}% khi đặt phòng</strong>
                  <p>
                    {level === 1
                      ? "Quyền lợi bắt đầu ngay khi bạn là thành viên EnziuRooms."
                      : `Mở khóa từ ${Number(tier.minCompletedBookings ?? 0)} booking đã hoàn tất.`}
                  </p>
                  <div className="enziu-tier-rule">
                    <Check size={17} />
                    Tự động áp dụng cho booking đủ điều kiện
                  </div>
                  {current ? <span className="enziu-current-tier-label">Cấp của bạn</span> : null}
                </article>
              );
            })}
          </div>
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
                        : "Ưu đãi EnziuRooms"}
                    </small>
                    <small>Hạn dùng: {dateLabel(promotion.endAt)}</small>
                    <span className={`promo-status ${promotion.lifecycle === "ACTIVE" ? "active" : ""}`}>
                      {lifecycleLabel(promotion.lifecycle)}
                    </span>
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
