import {
  Building2,
  Heart,
  MapPin,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  getHotelReviewSummary,
} from "../../services/bookingService";
import {
  getMyFavoriteHotels,
  removeFavoriteHotel,
} from "../../services/favoriteService";
import { getHotelById } from "../../services/hotelService";
import "./CustomerCollectionPages.css";

function hotelCover(hotel) {
  return hotel?.coverImageUrl
    ?? hotel?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.imageUrl
    ?? hotel?.images?.find((image) => image.cover || image.isCover)?.url
    ?? hotel?.images?.[0]?.imageUrl
    ?? hotel?.images?.[0]?.url
    ?? "";
}

function ratingLabel(value) {
  if (value == null) return "Chưa có đánh giá";
  if (value >= 9) return "Xuất sắc";
  if (value >= 8) return "Tuyệt vời";
  if (value >= 7) return "Tốt";
  if (value >= 6) return "Khá tốt";
  return "Ổn";
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function FavoritesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("saved-desc");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const favorites = await getMyFavoriteHotels();
        const normalizedFavorites = Array.isArray(favorites) ? favorites : [];

        const hydrated = await Promise.all(
          normalizedFavorites.map(async (favorite) => {
            const hotel = await getHotelById(favorite.hotelId).catch(() => null);
            const summary = hotel
              ? await getHotelReviewSummary(favorite.hotelId).catch(() => ({
                  reviewCount: 0,
                  averageRating: null,
                }))
              : {
                  reviewCount: 0,
                  averageRating: null,
                };

            return {
              ...favorite,
              hotel,
              summary,
            };
          }),
        );

        if (active) {
          setItems(hydrated);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.message
              ?? "Không thể tải danh sách khách sạn yêu thích.",
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

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());

    return [...items]
      .filter((item) => {
        if (!keyword) return true;
        return [
          item.hotel?.name,
          item.hotel?.city,
          item.hotel?.address,
        ].some((value) => normalize(value).includes(keyword));
      })
      .sort((a, b) => {
        if (sort === "rating-desc") {
          return Number(b.summary?.averageRating ?? -1)
            - Number(a.summary?.averageRating ?? -1);
        }

        if (sort === "name-asc") {
          return String(a.hotel?.name ?? "").localeCompare(
            String(b.hotel?.name ?? ""),
            "vi",
          );
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [items, query, sort]);

  async function removeFavorite(item) {
    const hotelName = item.hotel?.name ?? "khách sạn này";
    const accepted = window.confirm(
      `Bỏ ${hotelName} khỏi danh sách yêu thích?`,
    );

    if (!accepted) return;

    setRemovingId(item.hotelId);
    setError("");

    try {
      await removeFavoriteHotel(item.hotelId);
      setItems((current) =>
        current.filter((entry) => entry.hotelId !== item.hotelId),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể bỏ khách sạn khỏi danh sách yêu thích.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return <Loading message="Đang tải khách sạn yêu thích..." />;
  }

  return (
    <main className="customer-collection-page">
      <section className="container">
        <div className="collection-hero">
          <div>
            <span className="collection-kicker">
              <Heart size={15} fill="currentColor" />
              Danh sách đã lưu
            </span>
            <h1>Khách sạn yêu thích</h1>
            <p>
              Lưu lại những nơi bạn quan tâm để so sánh và đặt phòng nhanh hơn
              trong lần tìm kiếm tiếp theo.
            </p>
          </div>

          <div className="collection-counter">
            <strong>{items.length}</strong>
            <span>khách sạn đã lưu</span>
          </div>
        </div>

        {error ? <ErrorMessage message={error} /> : null}

        {items.length > 0 ? (
          <>
            <div className="collection-toolbar">
              <label className="collection-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm theo tên khách sạn hoặc địa điểm..."
                />
              </label>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="Sắp xếp khách sạn yêu thích"
              >
                <option value="saved-desc">Lưu gần đây nhất</option>
                <option value="rating-desc">Điểm cao nhất</option>
                <option value="name-asc">Tên A - Z</option>
              </select>
            </div>

            {filtered.length > 0 ? (
              <div className="favorite-grid">
                {filtered.map((item) => {
                  const hotel = item.hotel;
                  const cover = hotelCover(hotel);
                  const average = item.summary?.averageRating;
                  const reviewCount = item.summary?.reviewCount ?? 0;

                  return (
                    <article className="favorite-card" key={item.id ?? item.hotelId}>
                      <div className="favorite-card-media">
                        {cover ? (
                          <img src={cover} alt={hotel?.name ?? "Khách sạn"} />
                        ) : (
                          <div className="favorite-card-placeholder">
                            <Building2 size={44} />
                          </div>
                        )}

                        <button
                          type="button"
                          className="favorite-remove-button"
                          onClick={() => removeFavorite(item)}
                          disabled={removingId === item.hotelId}
                          title="Bỏ khỏi yêu thích"
                          aria-label={`Bỏ ${hotel?.name ?? "khách sạn"} khỏi yêu thích`}
                        >
                          <Heart size={21} fill="currentColor" />
                        </button>
                      </div>

                      <div className="favorite-card-body">
                        <div className="favorite-title-row">
                          <div>
                            <h2>{hotel?.name ?? "Khách sạn"}</h2>
                            <div className="favorite-stars" aria-label={`${hotel?.starRating ?? 0} sao`}>
                              {Array.from({ length: Number(hotel?.starRating ?? 0) }).map((_, index) => (
                                <Star key={index} size={15} fill="currentColor" />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="favorite-location">
                          <MapPin size={17} />
                          <span>
                            {[hotel?.address, hotel?.city].filter(Boolean).join(", ")
                              || "Chưa cập nhật địa chỉ"}
                          </span>
                        </div>

                        <div className="favorite-rating">
                          <span className="favorite-rating-badge">
                            {average == null ? "—" : Number(average).toFixed(1)}
                          </span>
                          <span className="favorite-rating-text">
                            <strong>{ratingLabel(average)}</strong>
                            <span>
                              {reviewCount > 0
                                ? `${reviewCount} đánh giá thật`
                                : "Chưa có đánh giá"}
                            </span>
                          </span>
                        </div>

                        <div className="favorite-card-actions">
                          <button
                            type="button"
                            className="collection-link-button"
                            onClick={() => removeFavorite(item)}
                            disabled={removingId === item.hotelId}
                          >
                            <Trash2 size={16} />
                            Bỏ lưu
                          </button>
                          {hotel ? (
                            <Link
                              className="collection-link-button primary"
                              to={`/hotels/${item.hotelId}`}
                            >
                              Xem khách sạn
                            </Link>
                          ) : (
                            <span className="collection-link-button" aria-disabled="true">
                              Không còn mở bán
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="collection-empty">
                <span className="collection-empty-icon">
                  <Search size={32} />
                </span>
                <h2>Không tìm thấy khách sạn phù hợp</h2>
                <p>Thử đổi từ khóa hoặc cách sắp xếp để xem lại danh sách đã lưu.</p>
              </div>
            )}
          </>
        ) : (
          <div className="collection-empty">
            <span className="collection-empty-icon">
              <Heart size={34} />
            </span>
            <h2>Bạn chưa lưu khách sạn nào</h2>
            <p>
              Khi thấy một khách sạn phù hợp, nhấn biểu tượng trái tim để thêm
              vào danh sách yêu thích của bạn.
            </p>
            <Link className="collection-link-button primary" to="/hotels">
              Khám phá khách sạn
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
