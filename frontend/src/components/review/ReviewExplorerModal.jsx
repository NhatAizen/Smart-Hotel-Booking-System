import {
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Frown,
  Image as ImageIcon,
  Search,
  Smile,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import "./ReviewExplorerModal.css";

const PAGE_SIZE = 5;

const CATEGORY_LABELS = [
  ["staff", "Nhân viên phục vụ"],
  ["facilities", "Tiện nghi"],
  ["cleanliness", "Sạch sẽ"],
  ["comfort", "Thoải mái"],
  ["value", "Đáng giá tiền"],
  ["location", "Địa điểm"],
  ["wifi", "WiFi miễn phí"],
];

function scoreLabel(score) {
  if (score == null) return "Chưa có đánh giá";
  if (score >= 9) return "Tuyệt hảo";
  if (score >= 8) return "Rất tốt";
  if (score >= 7) return "Tốt";
  if (score >= 6) return "Khá tốt";
  return "Ổn";
}

function tripTypeLabel(value) {
  return {
    FAMILY: "Gia đình",
    COUPLE: "Cặp đôi",
    SOLO: "Khách đi một mình",
    GROUP: "Nhóm bạn",
    OTHER: "Khách lưu trú",
  }[value] ?? "Khách lưu trú";
}

function formatReviewDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function monthYear(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`;
}

function reviewText(review) {
  return [
    review.title,
    review.positiveComment,
    review.negativeComment,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ReviewExplorerModal({
  hotel,
  roomTypes,
  reviews,
  summary,
  onClose,
}) {
  const [tripType, setTripType] = useState("ALL");
  const [scoreRange, setScoreRange] = useState("ALL");
  const [period, setPeriod] = useState("ALL");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState(null);
  const [filterReferenceTime] = useState(() => Date.now());

  useEffect(() => {
    function onEscape(event) {
      if (event.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else onClose();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [lightbox, onClose]);

  const roomTypeMap = useMemo(
    () => Object.fromEntries((roomTypes ?? []).map((type) => [String(type.id), type])),
    [roomTypes],
  );

  const filtered = useMemo(() => {
    const now = filterReferenceTime;
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedTopic = topic.trim().toLowerCase();

    const values = (reviews ?? []).filter((review) => {
      if (tripType !== "ALL" && review.tripType !== tripType) return false;

      if (scoreRange !== "ALL") {
        const rating = Number(review.rating ?? 0);
        if (scoreRange === "9_10" && rating < 9) return false;
        if (scoreRange === "7_8" && (rating < 7 || rating >= 9)) return false;
        if (scoreRange === "5_6" && (rating < 5 || rating >= 7)) return false;
        if (scoreRange === "1_4" && rating >= 5) return false;
      }

      if (period !== "ALL") {
        const created = new Date(review.createdAt).getTime();
        const months = Number(period);
        if (Number.isFinite(months)) {
          const threshold = now - months * 30.44 * 24 * 60 * 60 * 1000;
          if (created < threshold) return false;
        }
      }

      const text = reviewText(review);
      if (normalizedSearch && !text.includes(normalizedSearch)) {
        return false;
      }
      if (normalizedTopic && !text.includes(normalizedTopic)) {
        return false;
      }

      return true;
    });

    values.sort((a, b) => {
      if (sort === "HIGHEST") return Number(b.rating) - Number(a.rating);
      if (sort === "LOWEST") return Number(a.rating) - Number(b.rating);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return values;
  }, [reviews, tripType, scoreRange, period, search, topic, sort, filterReferenceTime]);

  useEffect(() => {
    setPage(1);
  }, [tripType, scoreRange, period, search, topic, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleReviews = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const categoryAverages = summary?.categoryAverages ?? {};

  return (
    <div
      className="review-explorer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="review-explorer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Đánh giá của khách về ${hotel?.name ?? "khách sạn"}`}
      >
        <button
          type="button"
          className="review-explorer-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          <X size={25} />
        </button>

        <header className="review-explorer-header">
          <h2>Đánh giá của khách về {hotel?.name}</h2>

          <div className="review-explorer-summary">
            <div className="review-summary-score">
              {summary?.averageRating != null ? (
                <strong>{Number(summary.averageRating).toFixed(1)}</strong>
              ) : null}
              <div>
                <b>{scoreLabel(summary?.averageRating)}</b>
                <span>{summary?.reviewCount ?? 0} đánh giá</span>
              </div>
            </div>

            <div className="review-category-bars">
              {CATEGORY_LABELS.map(([key, label]) => {
                const value = categoryAverages[key];
                if (value == null) return null;

                return (
                  <div key={key}>
                    <span>
                      {label}
                      <strong>{Number(value).toFixed(1)}</strong>
                    </span>
                    <i>
                      <b style={{ width: `${Number(value) * 10}%` }} />
                    </i>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        <section className="review-explorer-filters">
          <h3>Bộ lọc</h3>

          <div className="review-filter-grid">
            <label>
              <span>Khách đánh giá</span>
              <select value={tripType} onChange={(event) => setTripType(event.target.value)}>
                <option value="ALL">Tất cả ({reviews?.length ?? 0})</option>
                <option value="COUPLE">Cặp đôi</option>
                <option value="FAMILY">Gia đình</option>
                <option value="SOLO">Khách đi một mình</option>
                <option value="GROUP">Nhóm bạn</option>
              </select>
            </label>

            <label>
              <span>Điểm đánh giá</span>
              <select value={scoreRange} onChange={(event) => setScoreRange(event.target.value)}>
                <option value="ALL">Tất cả</option>
                <option value="9_10">9 - 10</option>
                <option value="7_8">7 - 8.9</option>
                <option value="5_6">5 - 6.9</option>
                <option value="1_4">Dưới 5</option>
              </select>
            </label>

            <label>
              <span>Ngôn ngữ</span>
              <select defaultValue="vi">
                <option value="vi">Tiếng Việt</option>
              </select>
            </label>

            <label>
              <span>Thời gian</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="ALL">Tất cả thời gian</option>
                <option value="3">3 tháng gần đây</option>
                <option value="6">6 tháng gần đây</option>
                <option value="12">12 tháng gần đây</option>
              </select>
            </label>
          </div>

          <div className="review-topic-row">
            <span>Chọn chủ đề để đọc đánh giá:</span>
            <div>
              {["Phòng", "Vị trí", "Sạch sẽ", "Giường", "Phòng tắm", "Nhân viên"].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={topic === item ? "active" : ""}
                  onClick={() => setTopic((current) => current === item ? "" : item)}
                >
                  + {item}
                </button>
              ))}
            </div>
          </div>

          <div className="review-search-row">
            <Search size={19} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm trong nhận xét của khách..."
            />
          </div>
        </section>

        <section className="review-explorer-list-section">
          <div className="review-list-heading">
            <div>
              <h3>Đánh giá của khách</h3>
              <p>{filtered.length} đánh giá phù hợp</p>
            </div>

            <label>
              <span>Sắp xếp:</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="NEWEST">Mới nhất</option>
                <option value="HIGHEST">Điểm cao nhất</option>
                <option value="LOWEST">Điểm thấp nhất</option>
              </select>
            </label>
          </div>

          {visibleReviews.length === 0 ? (
            <div className="review-empty-filter">
              Không có đánh giá phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="review-explorer-list">
              {visibleReviews.map((review) => {
                const roomType = roomTypeMap[String(review.roomTypeId)];
                const nights = nightsBetween(review.checkIn, review.checkOut);

                return (
                  <article className="review-explorer-card" key={review.id}>
                    <aside className="review-author-column">
                      <div className="review-author-head">
                        <span className="review-author-avatar">
                          <span>
                            {String(review.customerName ?? "K").charAt(0).toUpperCase()}
                          </span>
                          {review.customerAvatarUrl ? (
                            <img
                              src={review.customerAvatarUrl}
                              alt={review.customerName ?? "Ảnh đại diện khách hàng"}
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                        </span>
                        <div>
                          <strong>{review.customerName}</strong>
                          <small>Khách EnziuRooms</small>
                        </div>
                      </div>

                      <div className="review-stay-meta">
                        <p>
                          <BedDouble size={17} />
                          {roomType?.name ?? "Phòng đã lưu trú"}
                        </p>
                        <p>
                          <CalendarDays size={17} />
                          {nights} đêm · {monthYear(review.checkOut)}
                        </p>
                        <p>
                          <Users size={17} />
                          {tripTypeLabel(review.tripType)}
                        </p>
                      </div>
                    </aside>

                    <div className="review-content-column">
                      <div className="review-card-topline">
                        <div>
                          <small>Ngày đánh giá: {formatReviewDate(review.createdAt)}</small>
                          <h4>{review.title || scoreLabel(review.rating)}</h4>
                        </div>
                        <strong className="review-card-score">
                          {Number(review.rating).toFixed(1)}
                        </strong>
                      </div>

                      {review.positiveComment ? (
                        <p className="review-positive-line">
                          <Smile size={21} />
                          <span>{review.positiveComment}</span>
                        </p>
                      ) : null}

                      {review.negativeComment ? (
                        <p className="review-negative-line">
                          <Frown size={21} />
                          <span>{review.negativeComment}</span>
                        </p>
                      ) : null}

                      {Array.isArray(review.images) && review.images.length > 0 ? (
                        <div className="review-card-images">
                          {review.images.map((image, index) => (
                            <button
                              type="button"
                              key={`${image}-${index}`}
                              onClick={() => setLightbox({
                                images: review.images,
                                index,
                              })}
                            >
                              <img src={image} alt={`Ảnh đánh giá ${index + 1}`} />
                              {index === 0 ? <ImageIcon size={15} /> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pageCount > 1 ? (
            <nav className="review-pagination" aria-label="Phân trang đánh giá">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={18} />
              </button>

              {Array.from({ length: pageCount }).slice(0, 8).map((_, index) => {
                const value = index + 1;
                return (
                  <button
                    type="button"
                    key={value}
                    className={page === value ? "active" : ""}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                );
              })}

              {pageCount > 8 ? <span>… {pageCount}</span> : null}

              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight size={18} />
              </button>

              <p>
                Đang hiển thị {(page - 1) * PAGE_SIZE + 1}
                {" - "}
                {Math.min(page * PAGE_SIZE, filtered.length)}
              </p>
            </nav>
          ) : null}
        </section>
      </section>

      {lightbox ? (
        <div
          className="review-image-lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightbox(null);
          }}
        >
          <button type="button" onClick={() => setLightbox(null)} aria-label="Đóng ảnh">
            <X size={25} />
          </button>
          <img
            src={lightbox.images[lightbox.index]}
            alt="Ảnh đánh giá phóng to"
          />
        </div>
      ) : null}
    </div>
  );
}
