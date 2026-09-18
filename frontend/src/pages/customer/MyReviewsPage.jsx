import {
  BedDouble,
  CalendarDays,
  Camera,
  Frown,
  Hotel,
  Search,
  Smile,
  Star,
  Users,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { EmptyState, Modal, Pagination } from "../../components/ui";
import { getMyReviews } from "../../services/bookingService";
import {
  getHotelById,
  getRoomTypeById,
} from "../../services/hotelService";
import "./CustomerAccountExperience.css";
import "./CustomerCollectionPages.css";

const PAGE_SIZE = 5;

function hotelCover(hotel) {
  return hotel?.coverImageUrl
    ?? hotel?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.url
    ?? hotel?.images?.[0]?.imageUrl
    ?? hotel?.images?.[0]?.url
    ?? "";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatStayMonth(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`;
}

function nightCount(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;
  return Math.round((end - start) / 86400000);
}

function tripLabel(value) {
  const labels = {
    FAMILY: "Gia đình",
    COUPLE: "Cặp đôi",
    SOLO: "Một mình",
    GROUP: "Nhóm bạn",
  };
  return labels[value] ?? "Chưa có thông tin chuyến đi";
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function categoryValues(review) {
  return [
    ["Nhân viên", review.staffRating],
    ["Tiện nghi", review.facilitiesRating],
    ["Sạch sẽ", review.cleanlinessRating],
    ["Thoải mái", review.comfortRating],
    ["Đáng giá tiền", review.valueRating],
    ["Địa điểm", review.locationRating],
    ["WiFi", review.wifiRating],
  ].filter(([, value]) => value != null);
}

export default function MyReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [hotelMap, setHotelMap] = useState({});
  const [roomTypeMap, setRoomTypeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [lightbox, setLightbox] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await getMyReviews();
        const normalized = Array.isArray(data) ? data : [];

        const hotelIds = [...new Set(normalized.map((review) => review.hotelId).filter(Boolean))];
        const roomTypeIds = [...new Set(normalized.map((review) => review.roomTypeId).filter(Boolean))];

        const [hotels, roomTypes] = await Promise.all([
          Promise.all(
            hotelIds.map(async (hotelId) => {
              try {
                return [hotelId, await getHotelById(hotelId)];
              } catch {
                return [hotelId, null];
              }
            }),
          ),
          Promise.all(
            roomTypeIds.map(async (roomTypeId) => {
              try {
                return [roomTypeId, await getRoomTypeById(roomTypeId)];
              } catch {
                return [roomTypeId, null];
              }
            }),
          ),
        ]);

        if (active) {
          setReviews(normalized);
          setHotelMap(Object.fromEntries(hotels));
          setRoomTypeMap(Object.fromEntries(roomTypes));
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.message
              ?? "Không thể tải các đánh giá của bạn.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = reviews.length;
    const ratingValues = reviews
      .map((review) => Number(review.rating))
      .filter(Number.isFinite);
    const average = ratingValues.length
      ? ratingValues.reduce((sum, rating) => sum + rating, 0) / ratingValues.length
      : null;
    const photoCount = reviews.reduce(
      (sum, review) => sum + (Array.isArray(review.images) ? review.images.length : 0),
      0,
    );

    return { total, average, photoCount };
  }, [reviews]);

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());

    return reviews
      .filter((review) => {
        if (scoreFilter !== "all" && Number(review.rating) !== Number(scoreFilter)) {
          return false;
        }

        if (!keyword) return true;

        const hotel = hotelMap[review.hotelId];
        return [
          hotel?.name,
          review.title,
          review.positiveComment,
          review.negativeComment,
        ].some((value) => normalize(value).includes(keyword));
      })
      .sort((a, b) => {
        if (sort === "highest") return Number(b.rating) - Number(a.rating);
        if (sort === "lowest") return Number(a.rating) - Number(b.rating);
        if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [reviews, query, scoreFilter, sort, hotelMap]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleReviews = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  if (loading) {
    return <Loading message="Đang tải đánh giá của bạn..." />;
  }

  return (
    <main className="customer-collection-page">
      <section className="container">
        <div className="collection-hero">
          <div>
            <span className="collection-kicker">
              <Star size={15} fill="currentColor" />
              Trải nghiệm của tôi
            </span>
            <h1>Đánh giá của tôi</h1>
            <p>
              Xem lại những trải nghiệm bạn đã chia sẻ sau các chuyến lưu trú
              đã hoàn tất trên EnziuRooms.
            </p>
          </div>

          <div className="collection-counter">
            <strong>{stats.total}</strong>
            <span>đánh giá đã gửi</span>
          </div>
        </div>

        {error ? <ErrorMessage message={error} /> : null}

        {reviews.length > 0 ? (
          <>
            <div className="review-summary-grid">
              <div className="review-summary-card">
                <span>Tổng đánh giá</span>
                <strong>{stats.total}</strong>
              </div>
              <div className="review-summary-card">
                <span>Điểm trung bình của bạn</span>
                <strong>{stats.average == null ? "—" : `${stats.average.toFixed(1)}/10`}</strong>
              </div>
              <div className="review-summary-card">
                <span>Ảnh đã chia sẻ</span>
                <strong>{stats.photoCount}</strong>
              </div>
            </div>

            <div className="collection-toolbar">
              <label className="collection-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm khách sạn hoặc nội dung đánh giá..."
                  aria-label="Tìm trong đánh giá của tôi"
                />
              </label>

              <select
                value={scoreFilter}
                onChange={(event) => {
                  setScoreFilter(event.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo điểm"
              >
                <option value="all">Tất cả điểm</option>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => (
                  <option key={score} value={score}>{score}/10</option>
                ))}
              </select>

              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
                aria-label="Sắp xếp đánh giá"
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="highest">Điểm cao nhất</option>
                <option value="lowest">Điểm thấp nhất</option>
              </select>
            </div>

            {filtered.length > 0 ? (
              <>
                <div className="my-review-list">
                {visibleReviews.map((review) => {
                  const hotel = hotelMap[review.hotelId];
                  const roomType = roomTypeMap[review.roomTypeId];
                  const cover = hotelCover(hotel);
                  const nights = nightCount(review.checkIn, review.checkOut);

                  return (
                    <article className="my-review-card" key={review.id}>
                      <div className="my-review-card-head">
                        <div className="my-review-hotel">
                          <div className="my-review-hotel-photo">
                            {cover ? (
                              <img src={cover} alt={hotel?.name ?? "Khách sạn"} loading="lazy" decoding="async" />
                            ) : (
                              <span className="favorite-card-placeholder">
                                <Hotel size={28} />
                              </span>
                            )}
                          </div>
                          <div>
                            <h2>{hotel?.name ?? "Không thể tải thông tin khách sạn"}</h2>
                            <p>
                              Đánh giá ngày {formatDate(review.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div className="my-review-score">
                          {Number.isFinite(Number(review.rating))
                            ? Number(review.rating).toFixed(1)
                            : "—"}
                        </div>
                      </div>

                      <div className="my-review-content">
                        <div className="my-review-meta">
                          <div className="my-review-meta-item">
                            <BedDouble size={17} />
                            <span>{roomType?.name ?? "Không thể tải loại phòng"}</span>
                          </div>
                          <div className="my-review-meta-item">
                            <CalendarDays size={17} />
                            <span>{nights == null ? "Chưa có số đêm" : `${nights} đêm`} · {formatStayMonth(review.checkIn)}</span>
                          </div>
                          <div className="my-review-meta-item">
                            <Users size={17} />
                            <span>{tripLabel(review.tripType)}</span>
                          </div>
                          <div className="my-review-meta-item">
                            <Camera size={17} />
                            <span>
                              {Array.isArray(review.images)
                                ? `${review.images.length} ảnh`
                                : "Chưa có ảnh"}
                            </span>
                          </div>
                        </div>

                        <div className="my-review-copy">
                          <h3>{review.title || "Trải nghiệm lưu trú"}</h3>

                          {review.positiveComment ? (
                            <div className="review-sentiment positive">
                              <Smile size={20} />
                              <span>{review.positiveComment}</span>
                            </div>
                          ) : null}

                          {review.negativeComment ? (
                            <div className="review-sentiment negative">
                              <Frown size={20} />
                              <span>{review.negativeComment}</span>
                            </div>
                          ) : null}

                          <div className="review-category-chips">
                            {categoryValues(review).map(([label, value]) => (
                              <span className="review-category-chip" key={label}>
                                {label}: <strong>{value}/10</strong>
                              </span>
                            ))}
                          </div>

                          {review.images?.length > 0 ? (
                            <div className="my-review-images">
                              {review.images.map((image, index) => (
                                <button
                                  type="button"
                                  className="my-review-image-button"
                                  key={`${review.id}-${image}`}
                                  onClick={() => setLightbox({
                                    src: image,
                                    alt: `Ảnh đánh giá ${index + 1} tại ${hotel?.name ?? "khách sạn"}`,
                                  })}
                                >
                                  <img
                                    src={image}
                                    alt={`Ảnh đánh giá ${index + 1}`}
                                  />
                                </button>
                              ))}
                            </div>
                          ) : null}


                          {(review.hotelReply ?? review.replyContent ?? review.reply) ? (
                            <div className="my-review-hotel-reply">
                              <strong>Phản hồi từ {hotel?.name ?? "khách sạn"}</strong>
                              <p>{review.hotelReply ?? review.replyContent ?? review.reply}</p>
                              {(review.hotelReplyAt ?? review.replyAt) ? (
                                <small>{formatDate(review.hotelReplyAt ?? review.replyAt)}</small>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="my-review-footer">
                        <span>
                          Đánh giá được gửi sau khi khách đã hoàn tất kỳ lưu trú trên EnziuRooms.
                        </span>
                        {review.hotelId ? (
                          <Link
                            className="collection-link-button"
                            to={`/hotels/${review.hotelId}`}
                          >
                            Xem khách sạn
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                </div>
                <Pagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  ariaLabel="Phân trang đánh giá của tôi"
                />
              </>
            ) : (
              <EmptyState
                className="collection-empty"
                icon={<Search size={30} />}
                title="Không có đánh giá phù hợp bộ lọc"
                description="Thử bỏ bộ lọc điểm hoặc tìm với từ khóa khác."
              />
            )}
          </>
        ) : (
          <EmptyState
            className="collection-empty"
            icon={<Star size={30} />}
            title={error ? "Chưa thể hiển thị đánh giá" : "Bạn chưa có đánh giá nào"}
            description={error
              ? "Dữ liệu đánh giá chưa tải được. Hãy thử lại khi kết nối ổn định."
              : "Sau khi hoàn tất lưu trú và trả phòng, bạn có thể chia sẻ nhận xét, chấm điểm và thêm ảnh về kỳ nghỉ của bạn."}
            actions={!error
              ? <Link className="collection-link-button primary" to="/customer/bookings">Xem đơn đặt phòng</Link>
              : undefined}
          />
        )}
      </section>

      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title="Ảnh trong đánh giá"
        description={lightbox?.alt}
        size="lg"
        className="review-lightbox-modal"
        bodyClassName="review-lightbox-modal__body"
      >
        {lightbox ? (
          <img
            src={lightbox.src}
            alt={lightbox.alt}
          />
        ) : null}
      </Modal>
    </main>
  );
}
