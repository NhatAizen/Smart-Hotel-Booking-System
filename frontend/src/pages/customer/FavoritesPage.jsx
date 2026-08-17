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
  ConfirmDialog,
  EmptyState,
  Pagination,
} from "../../components/ui";
import {
  getHotelReviewSummary,
} from "../../services/bookingService";
import {
  getMyFavoriteHotels,
  removeFavoriteHotel,
} from "../../services/favoriteService";
import { getHotelById } from "../../services/hotelService";
import "./CustomerAccountExperience.css";
import "./CustomerCollectionPages.css";

const PAGE_SIZE = 6;

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
  const [page, setPage] = useState(1);
  const [pendingRemove, setPendingRemove] = useState(null);

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
              ? await getHotelReviewSummary(favorite.hotelId).catch(() => null)
              : null;

            return {
              ...favorite,
              hotel,
              summary,
              hotelUnavailable: !hotel,
              summaryUnavailable: Boolean(hotel) && !summary,
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  async function removeFavorite(item) {
    setRemovingId(item.hotelId);
    setError("");

    try {
      await removeFavoriteHotel(item.hotelId);
      setItems((current) =>
        current.filter((entry) => entry.hotelId !== item.hotelId),
      );
      setPendingRemove(null);
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
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm theo tên khách sạn hoặc địa điểm..."
                  aria-label="Tìm khách sạn yêu thích"
                />
              </label>

              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
                aria-label="Sắp xếp khách sạn yêu thích"
              >
                <option value="saved-desc">Lưu gần đây nhất</option>
                <option value="rating-desc">Điểm cao nhất</option>
                <option value="name-asc">Tên A - Z</option>
              </select>
            </div>

            {filtered.length > 0 ? (
              <>
                <div className="favorite-grid">
                {visibleItems.map((item) => {
                  const hotel = item.hotel;
                  const cover = hotelCover(hotel);
                  const parsedAverage = Number(item.summary?.averageRating);
                  const average = item.summary?.averageRating != null && Number.isFinite(parsedAverage)
                    ? parsedAverage
                    : null;
                  const reviewCount = item.summary?.reviewCount;

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
                          onClick={() => setPendingRemove(item)}
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
                            <h2>{hotel?.name ?? "Không thể tải thông tin khách sạn"}</h2>
                            {hotel?.starRating != null ? (
                              <div className="favorite-stars" aria-label={`${hotel.starRating} sao`}>
                                {Array.from({ length: Number(hotel.starRating) }).map((_, index) => (
                                  <Star key={index} size={15} fill="currentColor" />
                                ))}
                              </div>
                            ) : (
                              <span className="favorite-stars-unavailable">Chưa có dữ liệu hạng sao</span>
                            )}
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
                              {item.summaryUnavailable
                                ? "Không thể tải đánh giá"
                                : reviewCount > 0
                                ? `${reviewCount} đánh giá thật`
                                : "Chưa có đánh giá"}
                            </span>
                          </span>
                        </div>

                        <div className="favorite-card-actions">
                          <button
                            type="button"
                            className="collection-link-button"
                            onClick={() => setPendingRemove(item)}
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
                              Tạm chưa xem được chi tiết
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                </div>
                <Pagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  ariaLabel="Phân trang khách sạn yêu thích"
                />
              </>
            ) : (
              <EmptyState
                className="collection-empty"
                icon={<Search size={30} />}
                title="Không tìm thấy khách sạn phù hợp"
                description="Thử đổi từ khóa hoặc cách sắp xếp để xem lại danh sách đã lưu."
              />
            )}
          </>
        ) : (
          <EmptyState
            className="collection-empty"
            icon={<Heart size={30} />}
            title={error ? "Chưa thể hiển thị danh sách yêu thích" : "Bạn chưa lưu khách sạn nào"}
            description={error
              ? "Dữ liệu khách sạn đã lưu chưa tải được. Hãy thử lại khi kết nối ổn định."
              : "Khi thấy một khách sạn phù hợp, nhấn biểu tượng trái tim để thêm vào danh sách yêu thích của bạn."}
            actions={!error
              ? <Link className="collection-link-button primary" to="/hotels">Khám phá khách sạn</Link>
              : undefined}
          />
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Bỏ khỏi danh sách yêu thích?"
        description={pendingRemove?.hotel?.name
          ? `Khách sạn ${pendingRemove.hotel.name} sẽ được gỡ khỏi danh sách đã lưu.`
          : "Khách sạn này sẽ được gỡ khỏi danh sách đã lưu."}
        confirmLabel="Bỏ lưu"
        busy={removingId === pendingRemove?.hotelId}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove && void removeFavorite(pendingRemove)}
      />
    </main>
  );
}
