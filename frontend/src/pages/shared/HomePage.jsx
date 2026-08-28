import {
  ArrowRight,
  BadgePercent,
  Bookmark,
  Check,
  ChevronRight,
  CreditCard,
  Headphones,
  LogIn,
  MapPin,
  Quote,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import homeHeroImage from "../../assets/home-hero-hotel.jpg";
import homeWhyHotelImage from "../../assets/home-why-hotel.svg";
import { useAuth } from "../../auth/AuthContext";
import EnziuHomeFooter from "../../components/home/EnziuHomeFooter";
import HomeFutureSections from "../../components/home/HomeFutureSections";
import HotelSearchBar from "../../components/search/HotelSearchBar";
import { EmptyState, LoadingState, StatusBadge } from "../../components/ui";
import {
  getHotelReviews,
  getHotelReviewSummary,
} from "../../services/bookingService";
import { getHotels } from "../../services/hotelService";
import {
  getActiveCampaigns,
  getSavedPromotions,
  savePromotion,
} from "../../services/promotionService";
import { useRealtime } from "../../realtime/RealtimeContext";
import "./PromotionCenter.css";

function resolveHotelHeroImage(hotel) {
  if (!hotel) return "";

  if (hotel.coverImageUrl) return hotel.coverImageUrl;
  if (hotel.imageUrl) return hotel.imageUrl;

  const images = Array.isArray(hotel.images) ? hotel.images : [];
  const preferred =
    images.find((image) => image?.cover || image?.isCover)
    ?? images[0];

  if (!preferred) return "";
  if (typeof preferred === "string") return preferred;

  return (
    preferred.imageUrl
    ?? preferred.url
    ?? preferred.fileUrl
    ?? preferred.publicUrl
    ?? ""
  );
}

function resolveHotelPrice(hotel) {
  const candidates = [
    hotel?.minPrice,
    hotel?.lowestPrice,
    hotel?.startingPrice,
    hotel?.pricePerNight,
    hotel?.minimumPrice,
    hotel?.minRoomPrice,
  ];

  const value = candidates
    .map(Number)
    .find((item) => Number.isFinite(item) && item > 0);

  return value ?? null;
}

function money(value) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

function summaryScore(summary, hotel) {
  const candidates = [
    summary?.averageScore,
    summary?.averageRating,
    summary?.score,
    summary?.rating,
    hotel?.averageRating,
    hotel?.reviewScore,
  ];

  const value = candidates
    .map(Number)
    .find((item) => Number.isFinite(item) && item > 0);

  if (!value) return null;
  return value <= 5 ? value * 2 : value;
}

function summaryCount(summary) {
  const candidates = [
    summary?.reviewCount,
    summary?.totalReviews,
    summary?.count,
    summary?.total,
  ];

  const value = candidates
    .map(Number)
    .find((item) => Number.isFinite(item) && item >= 0);

  return value ?? 0;
}

function normalizeReview(review, hotel) {
  const scoreCandidates = [
    review?.score,
    review?.rating,
    review?.overallScore,
    review?.overallRating,
  ];

  const rawScore = scoreCandidates
    .map(Number)
    .find((item) => Number.isFinite(item) && item > 0);

  const score = rawScore
    ? (rawScore <= 5 ? rawScore * 2 : rawScore)
    : null;

  return {
    id: review?.id ?? `${hotel?.id}-${review?.bookingId ?? Math.random()}`,
    hotelId: hotel?.id,
    hotelName: hotel?.name ?? "Khách sạn EnziuRooms",
    customerName:
      review?.customerName
      ?? review?.guestName
      ?? review?.userName
      ?? "Khách hàng EnziuRooms",
    customerAvatarUrl:
      review?.customerAvatarUrl
      ?? review?.avatarUrl
      ?? null,
    score,
    title:
      review?.title
      ?? review?.headline
      ?? "",
    comment:
      review?.comment
      ?? review?.content
      ?? review?.reviewText
      ?? review?.description
      ?? "",
    createdAt:
      review?.createdAt
      ?? review?.reviewedAt
      ?? review?.updatedAt
      ?? "",
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

  const heroBannerRef = useRef(null);
  const heroFrameRef = useRef(null);

  const normalizedRole = String(user?.role ?? "")
    .replace(/^ROLE_/i, "")
    .toUpperCase();

  const isCustomer =
    isAuthenticated
    && normalizedRole === "CUSTOMER";

  const [hotels, setHotels] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [hotelSummaries, setHotelSummaries] = useState({});
  const [homepageReviews, setHomepageReviews] = useState([]);
  const [savedPromotionIds, setSavedPromotionIds] = useState(() => new Set());
  const [campaignSaveBusy, setCampaignSaveBusy] = useState("");
  const [loadingHotels, setLoadingHotels] = useState(true);

  useEffect(() => {
    return () => {
      if (heroFrameRef.current) {
        window.cancelAnimationFrame(heroFrameRef.current);
      }
    };
  }, []);

  function handleHeroPointerMove(event) {
    const element = heroBannerRef.current;
    if (!element || typeof window === "undefined") return;

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

    if (heroFrameRef.current) {
      window.cancelAnimationFrame(heroFrameRef.current);
    }

    heroFrameRef.current = window.requestAnimationFrame(() => {
      element.style.setProperty("--hero-parallax-x", `${x * 8}px`);
      element.style.setProperty("--hero-parallax-y", `${y * 6}px`);
      element.style.setProperty("--hero-light-x", `${50 + x * 7}%`);
      element.style.setProperty("--hero-light-y", `${34 + y * 6}%`);
    });
  }

  function handleHeroPointerLeave() {
    const element = heroBannerRef.current;
    if (!element) return;

    element.style.setProperty("--hero-parallax-x", "0px");
    element.style.setProperty("--hero-parallax-y", "0px");
    element.style.setProperty("--hero-light-x", "50%");
    element.style.setProperty("--hero-light-y", "34%");
  }

  const loadHotels = useCallback(async () => {
    setLoadingHotels(true);
    try {
      const data = await getHotels();
      setHotels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Không thể tải danh sách khách sạn", error);
      setHotels([]);
    } finally {
      setLoadingHotels(false);
    }
  }, []);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  const loadCampaigns = useCallback(async () => {
    try {
      const items = await getActiveCampaigns();
      setCampaigns(Array.isArray(items) ? items : []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    let active = true;

    if (!isCustomer) {
      setSavedPromotionIds(new Set());
      return undefined;
    }

    getSavedPromotions()
      .then((items) => {
        if (!active) return;
        setSavedPromotionIds(
          new Set(
            (Array.isArray(items) ? items : [])
              .map((item) => String(item.id)),
          ),
        );
      })
      .catch(() => {
        if (active) setSavedPromotionIds(new Set());
      });

    return () => {
      active = false;
    };
  }, [isCustomer]);

  useEffect(() => {
    const refreshCampaign = () => void loadCampaigns();
    const refreshHotels = () => void loadHotels();

    const offCampaignCreated = subscribe("CAMPAIGN_CREATED", refreshCampaign);
    const offCampaignStatus = subscribe("CAMPAIGN_STATUS_CHANGED", refreshCampaign);
    const offPromotionStatus = subscribe("PROMOTION_STATUS_CHANGED", refreshCampaign);

    // Nếu hệ thống hiện tại không phát các event hotel này,
    // subscribe chỉ không có dữ liệu; trang vẫn hoạt động bình thường.
    const offHotelCreated = subscribe("HOTEL_CREATED", refreshHotels);
    const offHotelChanged = subscribe("HOTEL_STATUS_CHANGED", refreshHotels);

    return () => {
      offCampaignCreated();
      offCampaignStatus();
      offPromotionStatus();
      offHotelCreated();
      offHotelChanged();
    };
  }, [loadCampaigns, loadHotels, subscribe]);

  /*
   * Review + điểm review dùng dữ liệu thật từ Booking Service.
   * Chỉ preload tối đa 20 hotel để homepage không bắn request vô hạn
   * khi hệ thống có rất nhiều hotel.
   */
  useEffect(() => {
    let active = true;

    async function loadReviewData() {
      const candidates = hotels
        .filter((hotel) => hotel?.id)
        .slice(0, 20);

      if (!candidates.length) {
        setHotelSummaries({});
        setHomepageReviews([]);
        return;
      }

      const settled = await Promise.all(
        candidates.map(async (hotel) => {
          const [summaryResult, reviewsResult] = await Promise.allSettled([
            getHotelReviewSummary(hotel.id),
            getHotelReviews(hotel.id),
          ]);

          return {
            hotel,
            summary:
              summaryResult.status === "fulfilled"
                ? summaryResult.value
                : null,
            reviews:
              reviewsResult.status === "fulfilled"
              && Array.isArray(reviewsResult.value)
                ? reviewsResult.value
                : [],
          };
        }),
      );

      if (!active) return;

      const summaries = {};
      const reviews = [];

      settled.forEach(({ hotel, summary, reviews: hotelReviews }) => {
        summaries[String(hotel.id)] = summary;

        hotelReviews.forEach((review) => {
          reviews.push(normalizeReview(review, hotel));
        });
      });

      reviews.sort((left, right) => {
        const leftDate = new Date(left.createdAt || 0).getTime();
        const rightDate = new Date(right.createdAt || 0).getTime();
        return rightDate - leftDate;
      });

      setHotelSummaries(summaries);
      setHomepageReviews(
        reviews
          .filter((review) => review.comment || review.title)
          .slice(0, 3),
      );
    }

    void loadReviewData();

    return () => {
      active = false;
    };
  }, [hotels]);

  async function handleSaveCampaign(campaign) {
    if (!campaign?.promotionId) return;

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (
      !isCustomer
      || savedPromotionIds.has(String(campaign.promotionId))
    ) {
      return;
    }

    setCampaignSaveBusy(String(campaign.promotionId));

    try {
      await savePromotion(campaign.promotionId);

      setSavedPromotionIds((current) => {
        const next = new Set(current);
        next.add(String(campaign.promotionId));
        return next;
      });
    } finally {
      setCampaignSaveBusy("");
    }
  }

  const featuredHotels = useMemo(() => {
    return [...hotels]
      .sort((left, right) => {
        const leftSummary = hotelSummaries[String(left?.id)];
        const rightSummary = hotelSummaries[String(right?.id)];
        const leftScore = summaryScore(leftSummary, left) ?? 0;
        const rightScore = summaryScore(rightSummary, right) ?? 0;

        if (rightScore !== leftScore) return rightScore - leftScore;

        const starDiff =
          Number(right?.starRating ?? 0)
          - Number(left?.starRating ?? 0);

        if (starDiff !== 0) return starDiff;

        return String(left?.name ?? "").localeCompare(
          String(right?.name ?? ""),
          "vi",
        );
      })
      .slice(0, 4);
  }, [hotels, hotelSummaries]);

  const destinations = useMemo(() => {
    const cityMap = new Map();

    hotels.forEach((hotel) => {
      const name = String(hotel?.city ?? "").trim();
      if (!name) return;

      const key = name.toLocaleLowerCase("vi");

      const current = cityMap.get(key) ?? {
        name,
        hotelCount: 0,
        image: "",
      };

      current.hotelCount += 1;
      current.image ||= resolveHotelHeroImage(hotel);

      cityMap.set(key, current);
    });

    return [...cityMap.values()]
      .sort(
        (left, right) =>
          right.hotelCount - left.hotelCount
          || left.name.localeCompare(right.name, "vi"),
      )
      .slice(0, 6);
  }, [hotels]);

  function searchDestination(destination) {
    navigate(
      `/hotels?city=${encodeURIComponent(destination)}&guests=2&rooms=1`,
    );
  }

  const activeCampaign = campaigns[0] ?? null;

  return (
    <>
      <main className="enziu-home">
        <section className="hero-section">
          <div className="container">
            <div
              ref={heroBannerRef}
              className="hero-banner hero-banner-motion"
              onPointerMove={handleHeroPointerMove}
              onPointerLeave={handleHeroPointerLeave}
            >
              <div className="hero-media" aria-hidden="true">
                <img
                  src={homeHeroImage}
                  alt=""
                  className="hero-media-image"
                  draggable="false"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>

              <div className="hero-media-overlay" aria-hidden="true" />
              <div className="hero-media-light" aria-hidden="true" />

              <div className="hero-content">
                <div className="hero-badge">
                  <Sparkles size={16} />
                  Đặt phòng thông minh cùng AI
                </div>

                <h1>
                  <span className="hero-title-line">
                    Bắt đầu hành trình tuyệt vời
                  </span>
                  <span className="hero-title-accent">
                    với nơi nghỉ phù hợp nhất
                  </span>
                </h1>

                <p>
                  Tìm và đặt khách sạn nhanh chóng, an toàn với mức giá
                  phù hợp nhất dành cho bạn.
                </p>
              </div>
            </div>

            <HotelSearchBar
              hotels={hotels}
              variant="home"
              initialValues={{
                city: "",
                checkIn: "",
                checkOut: "",
                guests: 2,
                rooms: 1,
              }}
            />
          </div>
        </section>

        {activeCampaign ? (
          <section className="home-campaign-section">
            <div className="container">
              <div className="home-campaign-strip">
                <span className="home-campaign-icon">
                  <BadgePercent size={24} />
                </span>

                <div className="home-campaign-copy">
                  <strong>{activeCampaign.title}</strong>
                  {activeCampaign.description ? (
                    <p>{activeCampaign.description}</p>
                  ) : null}
                </div>

                <div className="home-campaign-actions">
                  <span className="home-campaign-code">
                    {activeCampaign.promotionCode
                      ? `Mã ${activeCampaign.promotionCode}`
                      : (activeCampaign.badgeText || "Ưu đãi đang diễn ra")}
                  </span>

                  {activeCampaign.promotionId
                  && (isCustomer || !isAuthenticated) ? (
                    <button
                      type="button"
                      className={`campaign-save-button ${
                        savedPromotionIds.has(
                          String(activeCampaign.promotionId),
                        )
                          ? "saved"
                          : ""
                      }`}
                      disabled={
                        savedPromotionIds.has(
                          String(activeCampaign.promotionId),
                        )
                        || campaignSaveBusy
                          === String(activeCampaign.promotionId)
                      }
                      onClick={() => handleSaveCampaign(activeCampaign)}
                    >
                      {savedPromotionIds.has(
                        String(activeCampaign.promotionId),
                      ) ? (
                        <Check size={15} />
                      ) : !isAuthenticated ? (
                        <LogIn size={15} />
                      ) : (
                        <Bookmark size={15} />
                      )}
                      {savedPromotionIds.has(
                        String(activeCampaign.promotionId),
                      )
                        ? "Đã lưu"
                        : !isAuthenticated
                          ? "Đăng nhập để lưu mã"
                          : "Lưu mã"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="home-benefits-section">
          <div className="container home-benefits-grid">
            <article>
              <span><Zap size={21} /></span>
              <div>
                <h3>Đặt phòng nhanh</h3>
                <p>Quy trình đơn giản, xác nhận booking nhanh chóng.</p>
              </div>
            </article>

            <article>
              <span><ShieldCheck size={21} /></span>
              <div>
                <h3>Thông tin minh bạch</h3>
                <p>Giá, loại phòng và sức chứa được hiển thị rõ ràng.</p>
              </div>
            </article>

            <article>
              <span><CreditCard size={21} /></span>
              <div>
                <h3>Thanh toán an toàn</h3>
                <p>Theo dõi trạng thái thanh toán và hoàn tiền dễ dàng.</p>
              </div>
            </article>

            <article>
              <span><Headphones size={21} /></span>
              <div>
                <h3>Hỗ trợ thông minh</h3>
                <p>AI hỗ trợ lựa chọn khách sạn theo đúng nhu cầu.</p>
              </div>
            </article>
          </div>
        </section>

        {!isAuthenticated ? (
          <section className="home-section home-guest-cta-section">
            <div className="container">
              <div className="home-guest-cta-card">
                <div className="home-guest-cta-copy">
                  <span className="home-section-kicker">DÀNH CHO KHÁCH CHƯA ĐĂNG NHẬP</span>
                  <h2>Đăng nhập hoặc đăng ký để mở khóa ưu đãi Enziu</h2>
                  <p>
                    Tạo tài khoản để lưu khách sạn yêu thích, lưu mã giảm giá,
                    quản lý đơn đặt phòng và nhận thêm ưu đãi từ chương trình
                    thành viên EnziuRooms.
                  </p>

                  <div className="home-guest-cta-actions">
                    <Link to="/login" className="home-primary-link">
                      <LogIn size={17} />
                      Đăng nhập ngay
                    </Link>

                    <Link to="/register" className="home-secondary-link">
                      <UserPlus size={17} />
                      Tạo tài khoản mới
                    </Link>
                  </div>

                  <small>
                    Một số chức năng như Yêu thích, Đơn đặt phòng, Ưu đãi &amp; Hạng
                    và lưu mã khuyến mãi sẽ yêu cầu bạn đăng nhập trước khi sử dụng.
                  </small>
                </div>

                <div className="home-guest-cta-features" aria-label="Quyền lợi khi đăng nhập">
                  <article>
                    <span><Bookmark size={20} /></span>
                    <div>
                      <h3>Lưu khách sạn yêu thích</h3>
                      <p>Đăng nhập để lưu lại nơi nghỉ bạn quan tâm và xem lại nhanh hơn.</p>
                    </div>
                    <Link to="/login">Đăng nhập</Link>
                  </article>

                  <article>
                    <span><BadgePercent size={20} /></span>
                    <div>
                      <h3>Lưu mã & nhận ưu đãi</h3>
                      <p>Mở khóa mã giảm giá EnziuRooms và theo dõi quyền lợi thành viên.</p>
                    </div>
                    <Link to="/login">Đăng nhập</Link>
                  </article>

                  <article>
                    <span><CreditCard size={20} /></span>
                    <div>
                      <h3>Quản lý đơn đặt phòng</h3>
                      <p>Xem trạng thái booking, thanh toán và lịch sử lưu trú trong tài khoản.</p>
                    </div>
                    <Link to="/login">Đăng nhập</Link>
                  </article>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="home-section home-featured-section">
          <div className="container">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">
                  KHÁCH SẠN NỔI BẬT
                </span>
                <h2>Khám phá nơi nghỉ tuyệt vời</h2>
                <p>
                  Tuyển chọn từ chính dữ liệu khách sạn đang hoạt động
                  trên EnziuRooms, không sử dụng dữ liệu minh họa.
                </p>
              </div>

              <Link to="/hotels" className="home-view-all">
                Xem tất cả khách sạn
                <ChevronRight size={17} />
              </Link>
            </div>

            {loadingHotels ? (
              <LoadingState
                message="Đang tải danh sách khách sạn..."
                className="hotel-loading"
              />
            ) : featuredHotels.length === 0 ? (
              <EmptyState
                compact
                title="Chưa có khách sạn để hiển thị"
                description="Khi khách sạn được duyệt và hoạt động, dữ liệu sẽ tự xuất hiện ở đây."
                className="empty-state"
              />
            ) : (
              <div className="home-hotel-grid">
                {featuredHotels.map((hotel) => {
                  const summary = hotelSummaries[String(hotel.id)];
                  const score = summaryScore(summary, hotel);
                  const reviewCount = summaryCount(summary);
                  const price = resolveHotelPrice(hotel);
                  const image = resolveHotelHeroImage(hotel);

                  return (
                    <article className="home-hotel-card" key={hotel.id}>
                      <Link
                        to={`/hotels/${hotel.id}`}
                        className="home-hotel-image"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={hotel.name}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="home-hotel-image-placeholder">
                            EnziuRooms
                          </span>
                        )}

                        {hotel.status ? (
                          <StatusBadge
                            status={hotel.status}
                            className="home-hotel-status"
                          />
                        ) : null}
                      </Link>

                      <div className="home-hotel-body">
                        <div className="home-hotel-rating-row">
                          <div className="home-hotel-stars">
                            {Array.from({
                              length: Math.min(
                                5,
                                Math.max(0, Number(hotel.starRating ?? 0)),
                              ),
                            }).map((_, index) => (
                              <Star
                                key={index}
                                size={14}
                                fill="currentColor"
                              />
                            ))}
                          </div>

                          {score ? (
                            <div className="home-hotel-review-score">
                              <strong>{score.toFixed(1)}</strong>
                              <span>
                                {reviewCount > 0
                                  ? `${reviewCount} đánh giá`
                                  : "Điểm khách hàng"}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <Link
                          to={`/hotels/${hotel.id}`}
                          className="home-hotel-name"
                        >
                          {hotel.name}
                        </Link>

                        <p className="home-hotel-location">
                          <MapPin size={14} />
                          {[hotel.address, hotel.city]
                            .filter(Boolean)
                            .join(", ")}
                        </p>

                        <div className="home-hotel-footer">
                          <div>
                            {price ? (
                              <>
                                <small>Từ</small>
                                <strong>
                                  {money(price)}đ
                                  <em>/ đêm</em>
                                </strong>
                              </>
                            ) : (
                              <>
                                <small>Hạng khách sạn</small>
                                <strong>
                                  {Number(hotel.starRating ?? 0)}/5 sao
                                </strong>
                              </>
                            )}
                          </div>

                          <Link
                            to={`/hotels/${hotel.id}`}
                            className="home-hotel-detail"
                          >
                            Xem chi tiết
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="home-section home-destinations-section">
          <div className="container">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">
                  KHÁM PHÁ ĐIỂM ĐẾN
                </span>
                <h2>Khách sạn theo thành phố</h2>
                <p>
                  Thành phố được tạo tự động từ địa chỉ của khách sạn
                  đang có trong hệ thống.
                </p>
              </div>

              <Link to="/hotels" className="home-view-all">
                Xem tất cả điểm đến
                <ChevronRight size={17} />
              </Link>
            </div>

            {destinations.length ? (
              <div className="home-destination-grid">
                {destinations.map((destination) => (
                  <button
                    type="button"
                    className="home-destination-card"
                    key={destination.name}
                    onClick={() => searchDestination(destination.name)}
                  >
                    {destination.image ? (
                      <img
                        src={destination.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="home-destination-placeholder" />
                    )}

                    <span className="home-destination-overlay" />

                    <span className="home-destination-content">
                      <MapPin size={17} />
                      <span>
                        <strong>{destination.name}</strong>
                        <small>
                          {destination.hotelCount} khách sạn
                        </small>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="Chưa có điểm đến để hiển thị"
                description="Khi Hotel Admin bổ sung khách sạn và thành phố, mục này sẽ tự cập nhật."
              />
            )}
          </div>
        </section>

        <section className="home-section home-why-section">
          <div className="container">
            <div className="home-why-card">
              <div className="home-why-main">
                <span className="home-why-eyebrow">VÌ SAO CHỌN</span>

                <h2>EnziuRooms?</h2>

                <p className="home-why-description">
                  Trải nghiệm đặt phòng dễ dàng, minh bạch và đáng tin cậy
                  cho mọi chuyến đi.
                </p>

                <div className="home-why-features">
                  <article>
                    <span><ShieldCheck size={20} /></span>
                    <div>
                      <h3>Giá minh bạch</h3>
                      <p>Giá phòng và ưu đãi được hiển thị rõ ràng trước khi đặt.</p>
                    </div>
                  </article>

                  <article>
                    <span><Zap size={20} /></span>
                    <div>
                      <h3>Xác nhận nhanh</h3>
                      <p>Quy trình booking gọn, theo dõi trạng thái ngay trong tài khoản.</p>
                    </div>
                  </article>

                  <article>
                    <span><RefreshCcw size={20} /></span>
                    <div>
                      <h3>Hoàn tiền linh hoạt</h3>
                      <p>Theo dõi hoàn tiền và chính sách booking một cách rõ ràng.</p>
                    </div>
                  </article>

                  <article>
                    <span><Headphones size={20} /></span>
                    <div>
                      <h3>Hỗ trợ tận tâm</h3>
                      <p>Enziu AI hỗ trợ lựa chọn; giá và phòng trống vẫn lấy từ hệ thống.</p>
                    </div>
                  </article>
                </div>
              </div>

              <aside className="home-why-visual">
                <img
                  src={homeWhyHotelImage}
                  alt=""
                  className="home-why-illustration"
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                />

                <div className="home-why-cta">
                  <Link to="/hotels">
                    Khám phá khách sạn
                    <ArrowRight size={17} />
                  </Link>

                  <small>
                    {hotels.length > 0
                      ? `${hotels.length} khách sạn hiện có trên EnziuRooms`
                      : "Khách sạn mới sẽ tự xuất hiện khi được duyệt"}
                  </small>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="home-section home-reviews-section">
          <div className="container">
            <div className="home-section-heading">
              <div>
                <span className="home-section-kicker">
                  KHÁCH HÀNG NÓI GÌ?
                </span>
                <h2>Trải nghiệm thật từ khách hàng EnziuRooms</h2>
                <p>
                  Chỉ hiển thị review thật đã được trả về từ Booking Service.
                </p>
              </div>

              {isCustomer ? (
                <Link to="/customer/reviews" className="home-view-all">
                  Đánh giá của tôi
                  <ChevronRight size={17} />
                </Link>
              ) : null}
            </div>

            {homepageReviews.length ? (
              <div className={`home-review-grid home-review-grid-${Math.min(homepageReviews.length, 3)}`}>
                {homepageReviews.map((review) => (
                  <article
                    className="home-review-card"
                    key={review.id}
                  >
                    <header>
                      <span className="home-review-avatar">
                        <span>{avatarLetter(review.customerName)}</span>
                        {review.customerAvatarUrl ? (
                          <img
                            src={review.customerAvatarUrl}
                            alt=""
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                      </span>

                      <div>
                        <strong>{review.customerName}</strong>
                        <Link to={`/hotels/${review.hotelId}`}>
                          {review.hotelName}
                        </Link>
                      </div>

                      {review.score ? (
                        <b>{review.score.toFixed(1)}/10</b>
                      ) : null}
                    </header>

                    <div className="home-review-stars">
                      {reviewStars(review.score ?? 10).map(
                        (filled, index) => (
                          <Star
                            key={index}
                            size={15}
                            fill={filled ? "currentColor" : "none"}
                          />
                        ),
                      )}
                    </div>

                    <p>
                      <Quote size={16} />
                      <span>
                        {review.title
                          ? `${review.title}. ${review.comment}`
                          : review.comment}
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="home-reviews-empty">
                <Quote size={24} />
                <div>
                  <strong>Chưa có review để hiển thị trên trang chủ</strong>
                  <p>
                    Khi Customer hoàn thành lưu trú và đánh giá khách sạn,
                    review thật sẽ tự xuất hiện ở đây.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
        <HomeFutureSections />
      </main>

      <EnziuHomeFooter />
    </>
  );
}