import {
  Bot,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Headphones,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
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

import heroImage from "../../assets/hero.png";
import { useAuth } from "../../auth/AuthContext";
import { useAiAssistant } from "../../ai/AiAssistantContext";
import HotelSearchBar from "../../components/search/HotelSearchBar";
import { EmptyState, LoadingState, StatusBadge } from "../../components/ui";
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

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();
  const { subscribe } = useRealtime();
  const heroBannerRef = useRef(null);
  const heroFrameRef = useRef(null);

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
      element.style.setProperty("--hero-parallax-x", `${x * 10}px`);
      element.style.setProperty("--hero-parallax-y", `${y * 7}px`);
      element.style.setProperty("--hero-light-x", `${50 + x * 8}%`);
      element.style.setProperty("--hero-light-y", `${34 + y * 7}%`);
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

  const isCustomer =
    isAuthenticated
    && String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase() === "CUSTOMER";

  const [hotels, setHotels] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [savedPromotionIds, setSavedPromotionIds] = useState(() => new Set());
  const [campaignSaveBusy, setCampaignSaveBusy] = useState("");

  const [
    loadingHotels,
    setLoadingHotels,
  ] = useState(true);

  useEffect(() => {
    async function loadHotels() {
      try {
        const data =
          await getHotels();

        setHotels(
          Array.isArray(data)
            ? data
            : [],
        );
      } catch (error) {
        console.error(
          "Không thể tải danh sách khách sạn",
          error,
        );
      } finally {
        setLoadingHotels(false);
      }
    }

    loadHotels();
  }, []);

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
          new Set((Array.isArray(items) ? items : []).map((item) => String(item.id))),
        );
      })
      .catch(() => {
        if (active) setSavedPromotionIds(new Set());
      });
    return () => { active = false; };
  }, [isCustomer]);

  useEffect(() => {
    const refresh = () => void loadCampaigns();
    const offCreate = subscribe("CAMPAIGN_CREATED", refresh);
    const offStatus = subscribe("CAMPAIGN_STATUS_CHANGED", refresh);
    const offPromotionStatus = subscribe("PROMOTION_STATUS_CHANGED", refresh);
    return () => { offCreate(); offStatus(); offPromotionStatus(); };
  }, [loadCampaigns, subscribe]);

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
      setSavedPromotionIds((current) => {
        const next = new Set(current);
        next.add(String(campaign.promotionId));
        return next;
      });
    } catch {
      // Trang chủ chỉ giữ trải nghiệm gọn; chi tiết lỗi sẽ hiển thị ở trang Hạng & ưu đãi.
    } finally {
      setCampaignSaveBusy("");
    }
  }

  const featuredHotels =
    useMemo(
      () => hotels.slice(0, 4),
      [hotels],
    );

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
      .sort((a, b) => b.hotelCount - a.hotelCount || a.name.localeCompare(b.name, "vi"))
      .slice(0, 6);
  }, [hotels]);

  const heroBackgroundImage = useMemo(() => {
    const hotelImage = hotels
      .map(resolveHotelHeroImage)
      .find(Boolean);

    return hotelImage || heroImage;
  }, [hotels]);

  function searchDestination(
    destination,
  ) {
    navigate(
      `/hotels?city=${encodeURIComponent(
        destination,
      )}&guests=2&rooms=1`,
    );
  }

  return (
    <>
      <main>
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
                  src={heroBackgroundImage}
                  alt=""
                  className="hero-media-image"
                  draggable="false"
                />
              </div>

              <div className="hero-media-overlay" aria-hidden="true" />
              <div className="hero-media-light" aria-hidden="true" />

              <div className="hero-content">
                <div className="hero-badge">
                  <Sparkles size={17} />
                  Đặt phòng thông minh cùng AI
                </div>

                <h1>
                  Hành trình tuyệt vời
                  <span>
                    {" "}
                    bắt đầu từ nơi nghỉ phù hợp
                  </span>
                </h1>

                <p>
                  Tìm và đặt khách sạn nhanh chóng,
                  an toàn với mức giá phù hợp nhất
                  dành cho bạn.
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

        {campaigns[0] ? (
          <section className="container">
            <div className="campaign-strip">
              <div>
                <strong>{campaigns[0].title}</strong>
                <p>{campaigns[0].description}</p>
              </div>
              <div className="campaign-actions">
                <div className="campaign-code">
                  {campaigns[0].promotionCode
                    ? `Mã ${campaigns[0].promotionCode}`
                    : (campaigns[0].badgeText || "Ưu đãi đang diễn ra")}
                </div>
                {campaigns[0].promotionId && (isCustomer || !isAuthenticated) ? (
                  <button
                    type="button"
                    className={`campaign-save-button ${savedPromotionIds.has(String(campaigns[0].promotionId)) ? "saved" : ""}`}
                    disabled={
                      savedPromotionIds.has(String(campaigns[0].promotionId))
                      || campaignSaveBusy === String(campaigns[0].promotionId)
                    }
                    onClick={() => handleSaveCampaign(campaigns[0])}
                  >
                    {savedPromotionIds.has(String(campaigns[0].promotionId)) ? <Check size={15} /> : <Bookmark size={15} />}
                    {savedPromotionIds.has(String(campaigns[0].promotionId)) ? "Đã lưu" : "Lưu mã"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="benefits-section">
          <div className="container benefits-grid">
            <article className="benefit-card">
              <div className="benefit-icon">
                <CheckCircle2 />
              </div>

              <div>
                <h3>Đặt phòng nhanh</h3>
                <p>
                  Quy trình đơn giản, xác nhận
                  booking nhanh chóng.
                </p>
              </div>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">
                <ShieldCheck />
              </div>

              <div>
                <h3>Thông tin minh bạch</h3>
                <p>
                  Giá, loại phòng và sức chứa
                  được hiển thị rõ ràng.
                </p>
              </div>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">
                <CreditCard />
              </div>

              <div>
                <h3>Thanh toán an toàn</h3>
                <p>
                  Theo dõi trạng thái thanh toán
                  và hoàn tiền dễ dàng.
                </p>
              </div>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">
                <Headphones />
              </div>

              <div>
                <h3>Hỗ trợ thông minh</h3>
                <p>
                  AI hỗ trợ lựa chọn khách sạn
                  theo đúng nhu cầu.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="section-block">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-kicker">KHÁCH SẠN TRÊN ENZIUROOMS</span>

                <h2>Khám phá nơi nghỉ</h2>

                <p>
                  Khám phá những khách sạn đang
                  hoạt động trên EnziuRooms.
                </p>
              </div>

              <Link
                to="/hotels"
                className="view-all-link"
              >
                Xem tất cả
                <ChevronRight size={18} />
              </Link>
            </div>

            {loadingHotels ? (
              <LoadingState message="Đang tải danh sách khách sạn..." className="hotel-loading" />
            ) : featuredHotels.length === 0 ? (
              <EmptyState compact title="Chưa có khách sạn để hiển thị" className="empty-state" />
            ) : (
              <div className="hotel-card-grid">
                {featuredHotels.map(
                  (hotel) => (
                    <article
                      className="hotel-card"
                      key={hotel.id}
                    >
                      <Link
                        to={`/hotels/${hotel.id}`}
                        className="hotel-image-wrapper"
                      >
                        {resolveHotelHeroImage(hotel) ? (
                          <img src={resolveHotelHeroImage(hotel)} alt={hotel.name} className="hotel-image" />
                        ) : (
                          <span className="hotel-image-placeholder" aria-label={`${hotel.name} chưa cập nhật ảnh`}>
                            <span>EnziuRooms</span>
                          </span>
                        )}

                        {hotel.status ? <StatusBadge status={hotel.status} className="hotel-status" /> : null}
                      </Link>

                      <div className="hotel-card-body">
                        <div className="hotel-stars">
                          {Array.from({
                            length: Number(
                              hotel.starRating
                              ?? 0,
                            ),
                          }).map(
                            (
                              _,
                              starIndex,
                            ) => (
                              <Star
                                key={
                                  starIndex
                                }
                                size={16}
                                fill="currentColor"
                              />
                            ),
                          )}
                        </div>

                        <Link
                          to={`/hotels/${hotel.id}`}
                          className="hotel-name"
                        >
                          {hotel.name}
                        </Link>

                        <p className="hotel-address">
                          <MapPin size={17} />
                          {hotel.address},{" "}
                          {hotel.city}
                        </p>

                        {hotel.description ? <p className="hotel-description">{hotel.description}</p> : null}

                        <div className="hotel-card-footer">
                          <div>
                            <small>
                              Hạng khách sạn
                            </small>

                            <strong>
                              {hotel.starRating
                                ?? 0}
                              /5 sao
                            </strong>
                          </div>

                          <Link
                            to={`/hotels/${hotel.id}`}
                            className="hotel-detail-button"
                          >
                            Xem chi tiết
                          </Link>
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </div>
        </section>

        <section className="ai-promotion-section">
          <div className="container">
            <div className="ai-promotion-card">
              <div className="ai-illustration">
                <Bot size={76} />
              </div>

              <div className="ai-promotion-content">
                <span className="section-kicker">
                  AI HOTEL ASSISTANT
                </span>

                <h2>
                  Chưa biết nên chọn khách sạn nào?
                </h2>

                <p>
                  Hãy mô tả địa điểm, ngân sách và
                  số người. Trợ lý AI sẽ đề xuất
                  lựa chọn phù hợp.
                </p>

                <div className="ai-example">
                  “Tôi cần khách sạn tại Hồ Chí Minh
                  cho 2 người, giá dưới 2 triệu đồng
                  một đêm.”
                </div>

                <button
                  type="button"
                  className="ai-button"
                  onClick={() => {
                    if (!isCustomer) {
                      navigate("/login");
                      return;
                    }

                    openAssistant({ clearHotelContext: true, openTrip: true });
                  }}
                >
                  <Bot size={20} />
                  Hỏi AI ngay
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block destinations-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-kicker">KHÁM PHÁ ĐIỂM ĐẾN</span>

                <h2>Khách sạn theo thành phố</h2>

                <p>
                  Chọn thành phố và bắt đầu tìm
                  nơi nghỉ phù hợp.
                </p>
              </div>
            </div>

            {destinations.length ? <div className="destination-grid">
              {destinations.map(
                (destination) => (
                  <button
                    type="button"
                    className="destination-card"
                    key={destination.name}
                    onClick={() =>
                      searchDestination(
                        destination.name,
                      )
                    }
                  >
                    {destination.image ? (
                      <img src={destination.image} alt="" className="destination-image" />
                    ) : (
                      <span className="destination-image-placeholder" aria-hidden="true" />
                    )}
                    <div className="destination-overlay" />

                    <div className="destination-content">
                      <MapPin size={20} />

                      <div>
                        <h3>
                          {destination.name}
                        </h3>

                        <p>
                          {destination.hotelCount} khách sạn
                        </p>
                      </div>
                    </div>
                  </button>
                ),
              )}
            </div> : (
              <EmptyState compact title="Chưa có điểm đến để hiển thị" description="Điểm đến sẽ xuất hiện khi khách sạn cập nhật thành phố." />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
