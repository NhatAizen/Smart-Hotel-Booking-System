import {
  ArrowRight,
  BadgePercent,
  Bookmark,
  Check,
  ChevronRight,
  Compass,
  LogIn,
  MapPin,
  Quote,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import homeHeroImage from "../../assets/home-hero-hotel.jpg";
import { useAuth } from "../../auth/AuthContext";
import EnziuHomeFooter from "../../components/home/EnziuHomeFooter";
import HomeFutureSections from "../../components/home/HomeFutureSections";
import HomeHotelCard from "../../components/home/HomeHotelCard";
import EnziuSmartImage from "../../components/home/EnziuSmartImage";
import { EnziuOrbitMark } from "../../components/home/EnziuSignatureVisuals";
import SystemPromotionSection from "../../components/home/SystemPromotionSection";
import HotelSearchBar from "../../components/search/HotelSearchBar";
import { AvatarImage } from "../../components/ui";
import { getHotelReviews, getHotelReviewSummary } from "../../services/bookingService";
import { getHotels } from "../../services/hotelService";
import {
  getActiveCampaigns,
  getAvailablePromotions,
  getSavedPromotions,
  savePromotion,
} from "../../services/promotionService";
import { useRealtime } from "../../realtime/RealtimeContext";

function resolveHotelHeroImage(hotel) {
  if (!hotel) return "";
  if (hotel.coverImageUrl) return hotel.coverImageUrl;
  if (hotel.imageUrl) return hotel.imageUrl;

  const images = Array.isArray(hotel.images) ? hotel.images : [];
  const preferred = images.find((image) => image?.cover || image?.isCover) ?? images[0];
  if (!preferred) return "";
  if (typeof preferred === "string") return preferred;
  return preferred.imageUrl ?? preferred.url ?? preferred.fileUrl ?? preferred.publicUrl ?? "";
}

function resolveHotelPrice(hotel) {
  return [
    hotel?.minPrice,
    hotel?.lowestPrice,
    hotel?.startingPrice,
    hotel?.pricePerNight,
    hotel?.minimumPrice,
    hotel?.minRoomPrice,
  ].map(Number).find((value) => Number.isFinite(value) && value > 0) ?? null;
}

function summaryScore(summary, hotel) {
  const value = [
    summary?.averageScore,
    summary?.averageRating,
    summary?.score,
    summary?.rating,
    hotel?.averageRating,
    hotel?.reviewScore,
  ].map(Number).find((item) => Number.isFinite(item) && item > 0);
  if (!value) return null;
  return value <= 5 ? value * 2 : value;
}

function summaryCount(summary) {
  return [summary?.reviewCount, summary?.totalReviews, summary?.count, summary?.total]
    .map(Number)
    .find((value) => Number.isFinite(value) && value >= 0) ?? 0;
}

function normalizeReview(review, hotel) {
  const rawScore = [review?.score, review?.rating, review?.overallScore, review?.overallRating]
    .map(Number)
    .find((item) => Number.isFinite(item) && item > 0);
  return {
    id: review?.id
      ?? `${hotel?.id}-${review?.bookingId ?? review?.createdAt ?? review?.customerName ?? "review"}`,
    hotelName: hotel?.name ?? "Khách sạn EnziuRooms",
    customerName: review?.customerName ?? review?.guestName ?? review?.userName ?? "Khách hàng EnziuRooms",
    customerAvatarUrl: review?.customerAvatarUrl ?? review?.avatarUrl ?? null,
    score: rawScore ? (rawScore <= 5 ? rawScore * 2 : rawScore) : null,
    title: review?.title ?? review?.headline ?? "",
    comment: review?.comment ?? review?.content ?? review?.reviewText ?? review?.description ?? "",
    createdAt: review?.createdAt ?? review?.reviewedAt ?? review?.updatedAt ?? "",
  };
}

function avatarLetter(name) {
  return String(name ?? "K").trim().charAt(0).toUpperCase() || "K";
}

function reviewStars(score) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(score ?? 0) / 2)));
  return Array.from({ length: 5 }, (_, index) => index < filled);
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { subscribe } = useRealtime();
  const heroRef = useRef(null);
  const pointerFrameRef = useRef(null);

  const normalizedRole = String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase();
  const isCustomer = isAuthenticated && normalizedRole === "CUSTOMER";

  const [hotels, setHotels] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [systemPromotions, setSystemPromotions] = useState([]);
  const [hotelSummaries, setHotelSummaries] = useState({});
  const [homepageReviews, setHomepageReviews] = useState([]);
  const [savedPromotionIds, setSavedPromotionIds] = useState(() => new Set());
  const [campaignSaveBusy, setCampaignSaveBusy] = useState("");
  const [loadingHotels, setLoadingHotels] = useState(true);

  useEffect(() => () => {
    if (pointerFrameRef.current) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  function handleHeroPointerMove(event) {
    const element = heroRef.current;
    if (!element || typeof window === "undefined") return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || window.matchMedia("(pointer: coarse)").matches
    ) return;

    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    if (pointerFrameRef.current) window.cancelAnimationFrame(pointerFrameRef.current);
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      element.style.setProperty("--enziu-pointer-x", `${x * 10}px`);
      element.style.setProperty("--enziu-pointer-y", `${y * 8}px`);
      element.style.setProperty("--enziu-glow-x", `${50 + x * 10}%`);
      element.style.setProperty("--enziu-glow-y", `${38 + y * 8}%`);
    });
  }

  function handleHeroPointerLeave() {
    const element = heroRef.current;
    if (!element) return;
    element.style.setProperty("--enziu-pointer-x", "0px");
    element.style.setProperty("--enziu-pointer-y", "0px");
    element.style.setProperty("--enziu-glow-x", "50%");
    element.style.setProperty("--enziu-glow-y", "38%");
  }

  const loadHotels = useCallback(async () => {
  setLoadingHotels(true);

  try {
    let data;

    if (window.location.hostname === "localhost") {
      const response = await fetch("https://enziurooms.xyz/api/hotels", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      data = await response.json();
    } else {
      data = await getHotels();
    }

    const hotelList = Array.isArray(data)
      ? data
      : Array.isArray(data?.content)
        ? data.content
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.items)
            ? data.items
            : [];

    console.log("HOTELS:", hotelList);

    setHotels(hotelList);
  } catch (error) {
    console.error("Không thể tải danh sách khách sạn", error);
    setHotels([]);
  } finally {
    setLoadingHotels(false);
  }
}, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const items = await getActiveCampaigns();
      setCampaigns(Array.isArray(items) ? items : []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  const loadSystemPromotions = useCallback(async () => {
    try {
      const items = await getAvailablePromotions();
      const now = Date.now();
      setSystemPromotions((Array.isArray(items) ? items : [])
        .filter((promotion) => (
          promotion?.scope === "PLATFORM"
          && promotion?.active !== false
          && promotion?.lifecycle === "ACTIVE"
          && (!promotion?.endAt || new Date(promotion.endAt).getTime() > now)
        ))
        .sort((left, right) => new Date(left.endAt || 0) - new Date(right.endAt || 0)));
    } catch {
      setSystemPromotions([]);
    }
  }, []);

  useEffect(() => { void loadHotels(); }, [loadHotels]);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { void loadSystemPromotions(); }, [loadSystemPromotions]);

  useEffect(() => {
    let active = true;
    if (!isCustomer) {
      setSavedPromotionIds(new Set());
      return undefined;
    }
    getSavedPromotions()
      .then((items) => {
        if (!active) return;
        setSavedPromotionIds(new Set((Array.isArray(items) ? items : []).map((item) => String(item.id))));
      })
      .catch(() => { if (active) setSavedPromotionIds(new Set()); });
    return () => { active = false; };
  }, [isCustomer]);

  useEffect(() => {
    const refreshCampaigns = () => void loadCampaigns();
    const refreshSystemPromotions = () => void loadSystemPromotions();
    const refreshCampaignsAndPromotions = () => {
      void loadCampaigns();
      void loadSystemPromotions();
    };
    const refreshHotels = () => void loadHotels();
    const unsubscribe = [
      subscribe("CAMPAIGN_CREATED", refreshCampaigns),
      subscribe("CAMPAIGN_STATUS_CHANGED", refreshCampaigns),
      subscribe("PLATFORM_PROMOTION_CREATED", refreshSystemPromotions),
      subscribe("PROMOTION_STATUS_CHANGED", refreshCampaignsAndPromotions),
      subscribe("HOTEL_CREATED", refreshHotels),
      subscribe("HOTEL_STATUS_CHANGED", refreshHotels),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, [loadCampaigns, loadHotels, loadSystemPromotions, subscribe]);

  useEffect(() => {
    let active = true;
    async function loadReviewData() {
      const candidates = hotels.filter((hotel) => hotel?.id).slice(0, 20);
      if (!candidates.length) {
        setHotelSummaries({});
        setHomepageReviews([]);
        return;
      }
      const settled = await Promise.all(candidates.map(async (hotel) => {
        const [summaryResult, reviewsResult] = await Promise.allSettled([
          getHotelReviewSummary(hotel.id),
          getHotelReviews(hotel.id),
        ]);
        return {
          hotel,
          summary: summaryResult.status === "fulfilled" ? summaryResult.value : null,
          reviews: reviewsResult.status === "fulfilled" && Array.isArray(reviewsResult.value)
            ? reviewsResult.value
            : [],
        };
      }));
      if (!active) return;
      const summaries = {};
      const reviews = [];
      settled.forEach(({ hotel, summary, reviews: hotelReviews }) => {
        summaries[String(hotel.id)] = summary;
        hotelReviews.forEach((review) => reviews.push(normalizeReview(review, hotel)));
      });
      reviews.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
      setHotelSummaries(summaries);
      setHomepageReviews(reviews.filter((review) => review.comment || review.title).slice(0, 3));
    }
    void loadReviewData();
    return () => { active = false; };
  }, [hotels]);

  async function handleSaveCampaign(campaign) {
    if (!campaign?.promotionId) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!isCustomer || savedPromotionIds.has(String(campaign.promotionId))) return;
    setCampaignSaveBusy(String(campaign.promotionId));
    try {
      await savePromotion(campaign.promotionId);
      setSavedPromotionIds((current) => new Set([...current, String(campaign.promotionId)]));
    } catch (error) {
      console.error("Không thể lưu mã ưu đãi", error);
    } finally {
      setCampaignSaveBusy("");
    }
  }

  const featuredHotels = useMemo(() => [...hotels]
    .sort((left, right) => {
      const scoreDifference = (summaryScore(hotelSummaries[String(right?.id)], right) ?? 0)
        - (summaryScore(hotelSummaries[String(left?.id)], left) ?? 0);
      if (scoreDifference) return scoreDifference;
      const starDifference = Number(right?.starRating ?? 0) - Number(left?.starRating ?? 0);
      if (starDifference) return starDifference;
      return String(left?.name ?? "").localeCompare(String(right?.name ?? ""), "vi");
    })
    .slice(0, 4), [hotels, hotelSummaries]);

  const destinations = useMemo(() => {
    const cityMap = new Map();
    hotels.forEach((hotel) => {
      const name = String(hotel?.city ?? "").trim();
      if (!name) return;
      const key = name.toLocaleLowerCase("vi");
      const current = cityMap.get(key) ?? { name, hotelCount: 0, image: "" };
      current.hotelCount += 1;
      current.image ||= resolveHotelHeroImage(hotel);
      cityMap.set(key, current);
    });
    return [...cityMap.values()]
      .sort((left, right) => right.hotelCount - left.hotelCount || left.name.localeCompare(right.name, "vi"))
      .slice(0, 6);
  }, [hotels]);

  const totalReviews = useMemo(() => Object.values(hotelSummaries)
    .reduce((total, summary) => total + summaryCount(summary), 0), [hotelSummaries]);
  const activeCampaign = campaigns[0] ?? null;

  return (
    <>
      <main className="enziu-home enziu-home-rebuilt">
        <section className="enziu-hero-section">
          <div className="enziu-fullbleed-inner enziu-hero-inner">
            <div ref={heroRef} className="enziu-hero" onPointerMove={handleHeroPointerMove} onPointerLeave={handleHeroPointerLeave}>
              <div className="enziu-hero-background" aria-hidden="true">
                <img src={homeHeroImage} alt="" decoding="async" fetchPriority="high" draggable="false" />
              </div>
              <div className="enziu-hero-cinematic-overlay" aria-hidden="true" />
              <div className="enziu-hero-atmosphere" aria-hidden="true" />
              <div className="enziu-hero-rain" aria-hidden="true" />
              <div className="enziu-hero-copy">
                <span className="enziu-eyebrow"><i /> Không chỉ là một nơi để ở</span>
                <h1>Chạm vào nhịp điệu <em>của chuyến đi.</em></h1>
                <p>EnziuRooms đưa bạn từ cảm hứng ban đầu đến một nơi ở phù hợp, với trải nghiệm đặt phòng gọn gàng và dễ theo dõi.</p>
                <div className="enziu-hero-actions">
                  <Link to="/hotels" className="enziu-button enziu-button-primary">Khám phá nơi ở <ArrowRight size={18} /></Link>
                  <a href="#enziu-picks" className="enziu-text-link">Xem tuyển chọn <ChevronRight size={17} /></a>
                </div>
              </div>
              <div className="enziu-hero-live-data" aria-label="Thông tin nổi bật trên EnziuRooms">
                {hotels.length > 0 ? <span><strong>{hotels.length}</strong> nơi ở</span> : null}
                {destinations.length > 0 ? <span><strong>{destinations.length}</strong> điểm đến nổi bật</span> : null}
                {totalReviews > 0 ? <span><strong>{totalReviews}</strong> lượt đánh giá</span> : null}
              </div>
            </div>
            <div className="enziu-search-dock">
              <div className="enziu-search-dock-label"><Sparkles size={15} /> Bắt đầu chuyến đi</div>
              <HotelSearchBar hotels={hotels} variant="home" initialValues={{ city: "", checkIn: "", checkOut: "", guests: 2, rooms: 1 }} />
            </div>
          </div>
        </section>

        {activeCampaign ? (
          <section className="enziu-campaign-section" aria-label="Ưu đãi đang diễn ra">
            <div className="enziu-fullbleed-inner"><div className="enziu-campaign-ribbon">
              <span className="enziu-campaign-symbol"><BadgePercent size={25} /></span>
              <div className="enziu-campaign-copy"><small>Ưu đãi dành cho bạn</small><strong>{activeCampaign.title}</strong>{activeCampaign.description ? <p>{activeCampaign.description}</p> : null}</div>
              <div className="enziu-campaign-actions">
                <span className="enziu-campaign-code">{activeCampaign.promotionCode ? `Mã ${activeCampaign.promotionCode}` : (activeCampaign.badgeText || "Ưu đãi đang diễn ra")}</span>
                {activeCampaign.promotionId && (isCustomer || !isAuthenticated) ? (
                  <button type="button" className={`enziu-campaign-save ${savedPromotionIds.has(String(activeCampaign.promotionId)) ? "is-saved" : ""}`} disabled={savedPromotionIds.has(String(activeCampaign.promotionId)) || campaignSaveBusy === String(activeCampaign.promotionId)} onClick={() => handleSaveCampaign(activeCampaign)}>
                    {savedPromotionIds.has(String(activeCampaign.promotionId)) ? <Check size={16} /> : !isAuthenticated ? <LogIn size={16} /> : <Bookmark size={16} />}
                    {savedPromotionIds.has(String(activeCampaign.promotionId)) ? "Đã lưu" : !isAuthenticated ? "Đăng nhập để lưu" : "Lưu mã"}
                  </button>
                ) : null}
              </div>
            </div></div>
          </section>
        ) : null}

        <section className="enziu-clarity-section" aria-labelledby="enziu-clarity-title">
          <div className="enziu-fullbleed-inner enziu-clarity-layout">
            <header>
              <span className="enziu-eyebrow"><i /> Đặt phòng minh bạch</span>
              <h2 id="enziu-clarity-title">Rõ điều kiện. Rõ từng bước.</h2>
              <p>Các thông tin quan trọng được trình bày rõ ràng để bạn dễ cân nhắc trước khi đặt phòng.</p>
            </header>
            <div className="enziu-clarity-grid">
              <article><span><ShieldCheck size={20} /></span><div><strong>Chính sách rõ ràng</strong><p>Giờ lưu trú và điều kiện theo loại phòng được gom tại trang chi tiết khách sạn.</p></div></article>
              <article><span><WalletCards size={20} /></span><div><strong>Lựa chọn thanh toán rõ ràng</strong><p>Bạn sẽ thấy những phương thức thanh toán đang áp dụng cho phòng mình chọn.</p></div></article>
              <article><span><QrCode size={20} /></span><div><strong>QR hỗ trợ check-in</strong><p>Mã QR giúp khách sạn nhanh chóng tìm thông tin đặt phòng khi bạn đến nhận phòng.</p></div></article>
              <article><span><RotateCcw size={20} /></span><div><strong>Hoàn tiền có trạng thái</strong><p>Bạn có thể theo dõi tiến trình xử lý yêu cầu hoàn tiền ngay trong tài khoản.</p></div></article>
            </div>
          </div>
        </section>

        <SystemPromotionSection promotions={systemPromotions} />

        <section id="enziu-picks" className="enziu-section enziu-picks-section">
          <div className="enziu-fullbleed-inner">
            <div className="enziu-section-heading">
              <div><span className="enziu-eyebrow"><i /> Gợi ý cho bạn</span><h2>Nơi ở có sức hút riêng.</h2></div>
              <div className="enziu-section-aside"><p>Một vài gợi ý nổi bật để bạn bắt đầu lựa chọn nhanh hơn.</p><Link to="/hotels" className="enziu-text-link">Xem tất cả <ArrowRight size={17} /></Link></div>
            </div>
            {loadingHotels ? (
              <div className="enziu-loading-state" role="status"><span /> Đang tải gợi ý...</div>
            ) : featuredHotels.length ? (
              <div className="enziu-hotel-gallery">
                {featuredHotels.map((hotel, index) => {
                  const summary = hotelSummaries[String(hotel.id)];
                  return <HomeHotelCard key={hotel.id} hotel={hotel} image={resolveHotelHeroImage(hotel)} price={resolveHotelPrice(hotel)} score={summaryScore(summary, hotel)} reviewCount={summaryCount(summary)} featured={index === 0} />;
                })}
              </div>
            ) : (
              <div className="enziu-empty-state"><Compass size={28} /><div><strong>Chưa có nơi ở để giới thiệu</strong><p>Hiện chưa có nơi ở phù hợp để giới thiệu. Hãy quay lại sau nhé.</p></div></div>
            )}
          </div>
        </section>

        {destinations.length ? (
          <section className="enziu-section enziu-destinations-section">
            <div className="enziu-fullbleed-inner">
              <div className="enziu-section-heading enziu-section-heading-light"><div><span className="enziu-eyebrow"><i /> Khám phá điểm đến</span><h2>Đi theo nơi đang gọi bạn.</h2></div><p>Tìm cảm hứng từ những điểm đến đang có nhiều lựa chọn lưu trú trên EnziuRooms.</p></div>
              <div className="enziu-destination-rail">
                {destinations.map((destination, index) => (
                  <button type="button" className="enziu-destination-card" key={destination.name} onClick={() => navigate(`/hotels?city=${encodeURIComponent(destination.name)}&guests=2&rooms=1`)}>
                    <EnziuSmartImage src={destination.image} alt="" ratio={index % 3 === 1 ? "4 / 5" : "3 / 4"} />
                    <span className="enziu-destination-shade" /><span className="enziu-destination-number">0{index + 1}</span>
                    <span className="enziu-destination-copy"><small><MapPin size={13} /> {destination.hotelCount} nơi ở</small><strong>{destination.name}</strong></span>
                    <span className="enziu-destination-arrow"><ArrowRight size={18} /></span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepageReviews.length ? (
          <section className="enziu-section enziu-voices-section">
            <div className="enziu-fullbleed-inner enziu-voices-layout">
              <div className="enziu-voices-intro"><span className="enziu-eyebrow"><i /> Chia sẻ sau chuyến đi</span><h2>Khách lưu trú nói gì?</h2><p>Những nhận xét được gửi sau khi khách hoàn thành kỳ nghỉ.</p><div className="enziu-voices-seal"><ShieldCheck size={18} /> Đánh giá sau lưu trú</div></div>
              <div className={`enziu-review-stack is-${homepageReviews.length === 1 ? "single" : homepageReviews.length === 2 ? "pair" : "many"}`}>
                {homepageReviews.map((review, index) => (
                  <article className="enziu-review-card" key={`${review.id}-${index}`}>
                    <Quote className="enziu-review-quote" size={31} />
                    {review.score ? <div className="enziu-review-stars" aria-label={`${Math.round(Number(review.score) / 2)} trên 5 sao`}>{reviewStars(review.score).map((filled, starIndex) => <Star key={starIndex} size={14} fill={filled ? "currentColor" : "none"} />)}</div> : null}
                    {review.title ? <h3>{review.title}</h3> : null}
                    {review.comment ? <p>“{review.comment}”</p> : null}
                    <footer><AvatarImage source={review.customerAvatarUrl} alt={`Ảnh đại diện của ${review.customerName}`} loading="lazy" fallback={<span>{avatarLetter(review.customerName)}</span>} /><div><strong>{review.customerName}</strong><small>{review.hotelName}</small></div></footer>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!isAuthenticated ? (
          <section className="enziu-section enziu-guest-section"><div className="enziu-fullbleed-inner"><div className="enziu-guest-card">
            <EnziuOrbitMark className="enziu-guest-mark" />
            <div><span className="enziu-eyebrow"><i /> Không cần tài khoản để khám phá</span><h2>Đăng nhập khi bạn muốn giữ lại hành trình.</h2><p>Bạn vẫn có thể xem trang chủ, danh sách và chi tiết khách sạn. Tài khoản chỉ cần khi bạn muốn lưu yêu thích, lưu ưu đãi hoặc quản lý đơn đặt phòng.</p></div>
            <div className="enziu-guest-actions"><Link to="/login" className="enziu-button enziu-button-primary"><LogIn size={17} /> Đăng nhập</Link><Link to="/register" className="enziu-button enziu-button-ghost"><UserPlus size={17} /> Tạo tài khoản</Link></div>
          </div></div></section>
        ) : null}

        <HomeFutureSections />
      </main>
      <EnziuHomeFooter />
    </>
  );
}
