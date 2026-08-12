import {
  Bot,
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
  useEffect,
  useMemo,
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
import { getHotels } from "../../services/hotelService";

const destinations = [
  {
    name: "Hồ Chí Minh",
    subtitle: "Trung tâm sôi động",
    className: "destination-saigon",
  },
  {
    name: "Đà Nẵng",
    subtitle: "Thành phố biển",
    className: "destination-danang",
  },
  {
    name: "Hà Nội",
    subtitle: "Thủ đô nghìn năm",
    className: "destination-hanoi",
  },
  {
    name: "Đà Lạt",
    subtitle: "Thành phố ngàn hoa",
    className: "destination-dalat",
  },
  {
    name: "Nha Trang",
    subtitle: "Thiên đường nghỉ dưỡng",
    className: "destination-nhatrang",
  },
  {
    name: "Phú Quốc",
    subtitle: "Đảo ngọc Việt Nam",
    className: "destination-phuquoc",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();

  const isCustomer =
    isAuthenticated
    && String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase() === "CUSTOMER";

  const [hotels, setHotels] =
    useState([]);

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

  const featuredHotels =
    useMemo(
      () => hotels.slice(0, 4),
      [hotels],
    );

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
              className="hero-banner"
              style={{
                backgroundImage: `linear-gradient(
                  90deg,
                  rgba(3, 20, 38, 0.82),
                  rgba(3, 20, 38, 0.25)
                ), url(${heroImage})`,
              }}
            >
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
                <span className="section-kicker">
                  LỰA CHỌN NỔI BẬT
                </span>

                <h2>
                  Khách sạn được quan tâm
                </h2>

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
              <div className="hotel-loading">
                Đang tải danh sách khách sạn...
              </div>
            ) : featuredHotels.length === 0 ? (
              <div className="empty-state">
                Chưa có khách sạn để hiển thị.
              </div>
            ) : (
              <div className="hotel-card-grid">
                {featuredHotels.map(
                  (hotel, index) => (
                    <article
                      className="hotel-card"
                      key={hotel.id}
                    >
                      <Link
                        to={`/hotels/${hotel.id}`}
                        className="hotel-image-wrapper"
                      >
                        <img
                          src={
                            hotel.imageUrl
                            || heroImage
                          }
                          alt={hotel.name}
                          className={
                            `hotel-image `
                            + `hotel-image-${index + 1}`
                          }
                        />

                        <span className="hotel-status">
                          {hotel.status
                            === "ACTIVE"
                            ? "Đang hoạt động"
                            : hotel.status}
                        </span>
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

                        <p className="hotel-description">
                          {hotel.description
                            || "Không gian nghỉ dưỡng thoải mái và tiện nghi."}
                        </p>

                        <div className="hotel-card-footer">
                          <div>
                            <small>
                              Đánh giá
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
                <span className="section-kicker">
                  KHÁM PHÁ VIỆT NAM
                </span>

                <h2>Điểm đến phổ biến</h2>

                <p>
                  Chọn thành phố và bắt đầu tìm
                  nơi nghỉ phù hợp.
                </p>
              </div>
            </div>

            <div className="destination-grid">
              {destinations.map(
                (destination) => (
                  <button
                    type="button"
                    className={
                      `destination-card `
                      + destination.className
                    }
                    key={destination.name}
                    onClick={() =>
                      searchDestination(
                        destination.name,
                      )
                    }
                  >
                    <div className="destination-overlay" />

                    <div className="destination-content">
                      <MapPin size={20} />

                      <div>
                        <h3>
                          {destination.name}
                        </h3>

                        <p>
                          {destination.subtitle}
                        </p>
                      </div>
                    </div>
                  </button>
                ),
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}