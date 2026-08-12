import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  Wifi,
  Wind,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import HotelSearchBar from "../../components/search/HotelSearchBar";
import HotelMapOverlay from "../../components/map/HotelMapOverlay";
import { getHotelReviewSummary } from "../../services/bookingService";
import { getHotels } from "../../services/hotelService";
import {
  addFavoriteHotel,
  getMyFavoriteHotels,
  removeFavoriteHotel,
} from "../../services/favoriteService";

const HOTEL_CATALOG_CHANGED_KEY = "enziu:hotel-catalog-changed";

const starOptions = [
  5,
  4,
  3,
  2,
  1,
];

function tomorrow(offset = 0) {
  const date = new Date();

  date.setDate(
    date.getDate() + 1 + offset,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function hotelCover(hotel) {
  return hotel.coverImageUrl
    ?? hotel.imageUrl
    ?? hotel.images?.find((image) => image.cover || image.isCover)?.imageUrl
    ?? hotel.images?.find((image) => image.cover || image.isCover)?.url
    ?? "";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function HotelsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isCustomer = isAuthenticated && user?.role === "CUSTOMER";
  const [searchParams] =
    useSearchParams();

  const [hotels, setHotels] =
    useState([]);

  const [reviewSummaries, setReviewSummaries] =
    useState({});

  const [favoriteIds, setFavoriteIds] =
    useState(() => new Set());

  const [favoriteBusyId, setFavoriteBusyId] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [mapMode, setMapMode] =
    useState(false);

  const [catalogVersion, setCatalogVersion] =
    useState(0);

  const [filters, setFilters] =
    useState({
      stars: [],
      maxPrice: 10000000,
      sort: "recommended",
    });

  const searchValues =
    useMemo(
      () => ({
        city:
          searchParams.get("city")
          ?? "",
        checkIn:
          searchParams.get("checkIn")
          ?? tomorrow(0),
        checkOut:
          searchParams.get("checkOut")
          ?? tomorrow(1),
        guests: Number(
          searchParams.get("guests")
          ?? 2,
        ),
        rooms: Number(
          searchParams.get("rooms")
          ?? 1,
        ),
      }),
      [searchParams],
    );

  useEffect(() => {
    function refreshCatalog() {
      setCatalogVersion((current) => current + 1);
    }

    function handleStorage(event) {
      if (event.key === HOTEL_CATALOG_CHANGED_KEY) {
        refreshCatalog();
      }
    }

    window.addEventListener("focus", refreshCatalog);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("focus", refreshCatalog);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadFavorites() {
      if (!isCustomer) {
        setFavoriteIds(new Set());
        return;
      }

      try {
        const favorites = await getMyFavoriteHotels();
        if (active) {
          setFavoriteIds(
            new Set((Array.isArray(favorites) ? favorites : []).map((item) => item.hotelId)),
          );
        }
      } catch {
        if (active) setFavoriteIds(new Set());
      }
    }

    loadFavorites();

    return () => {
      active = false;
    };
  }, [isCustomer]);

  useEffect(() => {
    async function loadHotels() {
      if (catalogVersion === 0) setLoading(true);
      setError("");

      try {
        const data =
          await getHotels();

        const normalized =
          Array.isArray(data)
            ? data
            : [];

        setHotels(normalized);

        const summaries =
          await Promise.all(
            normalized.map(
              async (hotel) => {
                try {
                  const summary =
                    await getHotelReviewSummary(
                      hotel.id,
                    );
                  return [
                    hotel.id,
                    summary,
                  ];
                } catch {
                  return [
                    hotel.id,
                    {
                      reviewCount: 0,
                      averageRating: null,
                    },
                  ];
                }
              },
            ),
          );

        setReviewSummaries(
          Object.fromEntries(
            summaries,
          ),
        );
      } catch (requestError) {
        setError(
          requestError.response
            ?.data?.message
          ?? "Không thể tải danh sách khách sạn.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadHotels();
  }, [catalogVersion]);

  const visibleHotels =
    useMemo(() => {
      const keyword =
        normalizeText(
          searchValues.city,
        );

      let list =
        hotels.filter((hotel) => {
          const searchableValue =
            normalizeText(
              [
                hotel.name,
                hotel.city,
                hotel.address,
              ].join(" "),
            );

          const cityMatch =
            !keyword
            || searchableValue.includes(
              keyword,
            );

          const starMatch =
            filters.stars.length
              === 0
            || filters.stars.includes(
              Number(
                hotel.starRating,
              ),
            );

          return (
            cityMatch
            && starMatch
          );
        });

      if (
        filters.sort
        === "stars-desc"
      ) {
        list = [...list].sort(
          (a, b) =>
            Number(
              b.starRating ?? 0,
            )
            - Number(
              a.starRating ?? 0,
            ),
        );
      }

      if (
        filters.sort
        === "name-asc"
      ) {
        list = [...list].sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "vi",
            ),
        );
      }

      return list;
    }, [
      hotels,
      searchValues.city,
      filters,
    ]);

  function toggleStar(star) {
    setFilters((current) => ({
      ...current,
      stars:
        current.stars.includes(star)
          ? current.stars.filter(
            (item) =>
              item !== star,
          )
          : [
            ...current.stars,
            star,
          ],
    }));
  }

  async function toggleFavorite(hotelId) {
    if (!isCustomer) {
      navigate("/login");
      return;
    }

    if (favoriteBusyId === hotelId) return;

    const currentlyFavorite = favoriteIds.has(hotelId);
    setFavoriteBusyId(hotelId);

    // Cập nhật UI ngay, nếu API lỗi sẽ rollback.
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (currentlyFavorite) next.delete(hotelId);
      else next.add(hotelId);
      return next;
    });

    try {
      if (currentlyFavorite) {
        await removeFavoriteHotel(hotelId);
      } else {
        await addFavoriteHotel(hotelId);
      }
    } catch (requestError) {
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (currentlyFavorite) next.add(hotelId);
        else next.delete(hotelId);
        return next;
      });

      setError(
        requestError.response?.data?.message
          ?? "Không thể cập nhật danh sách yêu thích.",
      );
    } finally {
      setFavoriteBusyId(null);
    }
  }

  const openHotel = useCallback((hotelId) => {
    const params =
      new URLSearchParams({
        checkIn:
          searchValues.checkIn,
        checkOut:
          searchValues.checkOut,
        guests: String(
          searchValues.guests,
        ),
        rooms: String(
          searchValues.rooms,
        ),
      });

    navigate(
      `/hotels/${hotelId}?${params.toString()}`,
    );
  }, [navigate, searchValues]);

  if (loading) {
    return (
      <Loading message="Đang tìm khách sạn phù hợp..." />
    );
  }

  return (
    <main className="customer-hotels-page">
      <section className="customer-search-hero">
        <div className="container">
          <HotelSearchBar
            hotels={hotels}
            variant="results"
            initialValues={
              searchValues
            }
          />
        </div>
      </section>

      <div className="container customer-results-container">
        <nav className="customer-breadcrumb">
          <Link to="/">
            Trang chủ
          </Link>

          <ChevronRight size={15} />

          <Link to="/hotels">
            Khách sạn
          </Link>

          {searchValues.city ? (
            <>
              <ChevronRight size={15} />
              <span>
                {searchValues.city}
              </span>
            </>
          ) : null}
        </nav>

        <ErrorMessage message={error} />

        <div className="customer-results-layout">
          <aside className="customer-filter-card">
            <div className="customer-filter-title">
              <div>
                <SlidersHorizontal
                  size={20}
                />

                <strong>
                  Bộ lọc tìm kiếm
                </strong>
              </div>

              <button
                type="button"
                onClick={() =>
                  setFilters({
                    stars: [],
                    maxPrice:
                      10000000,
                    sort:
                      "recommended",
                  })
                }
              >
                Xóa tất cả
              </button>
            </div>

            <div className="customer-filter-group">
              <h3>
                Khoảng giá / đêm
              </h3>

              <input
                type="range"
                min="0"
                max="10000000"
                step="100000"
                value={
                  filters.maxPrice
                }
                onChange={(event) =>
                  setFilters(
                    (current) => ({
                      ...current,
                      maxPrice:
                        Number(
                          event.target
                            .value,
                        ),
                    }),
                  )
                }
              />

              <div className="customer-price-range">
                <span>0đ</span>

                <span>
                  {filters.maxPrice
                    .toLocaleString(
                      "vi-VN",
                    )}
                  đ
                </span>
              </div>
            </div>

            <div className="customer-filter-group">
              <h3>Xếp hạng sao</h3>

              {starOptions.map(
                (star) => (
                  <label
                    className="customer-checkbox-row"
                    key={star}
                  >
                    <input
                      type="checkbox"
                      checked={
                        filters.stars
                          .includes(star)
                      }
                      onChange={() =>
                        toggleStar(star)
                      }
                    />

                    <span>
                      {star} sao
                    </span>

                    <small>
                      {
                        hotels.filter(
                          (hotel) =>
                            Number(
                              hotel.starRating,
                            )
                            === star,
                        ).length
                      }
                    </small>
                  </label>
                ),
              )}
            </div>

            <div className="customer-filter-group">
              <h3>
                Tiện nghi cơ bản
              </h3>

              <label className="customer-checkbox-row">
                <input type="checkbox" />
                <span>
                  Wifi miễn phí
                </span>
              </label>

              <label className="customer-checkbox-row">
                <input type="checkbox" />
                <span>Điều hòa</span>
              </label>

              <label className="customer-checkbox-row">
                <input type="checkbox" />
                <span>Bãi đỗ xe</span>
              </label>
            </div>
          </aside>

          <section className="customer-results-main">
            <div className="customer-results-heading">
              <div>
                <h1>
                  {searchValues.city
                    || "Tất cả điểm đến"}
                  :{" "}
                  {
                    visibleHotels.length
                  }{" "}
                  khách sạn được tìm
                  thấy
                </h1>

                <select
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters(
                      (current) => ({
                        ...current,
                        sort:
                          event.target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="recommended">
                    Sắp xếp: Lựa chọn
                    hàng đầu
                  </option>

                  <option value="stars-desc">
                    Số sao cao nhất
                  </option>

                  <option value="name-asc">
                    Tên khách sạn A–Z
                  </option>
                </select>
              </div>

              <button
                type="button"
                className="customer-map-button"
                onClick={() => setMapMode(true)}
              >
                <Map size={18} />
                Xem bản đồ
              </button>
            </div>

            <div className="customer-hotel-list">
              {visibleHotels.length
                === 0 ? (
                <div className="customer-empty-results">
                  <Search size={40} />

                  <h2>
                    Không tìm thấy khách
                    sạn phù hợp
                  </h2>

                  <p>
                    Hãy thử thay đổi thành
                    phố hoặc bỏ bớt bộ lọc.
                  </p>
                </div>
              ) : (
                visibleHotels.map(
                  (hotel) => (
                    <article
                      className="customer-hotel-card"
                      key={hotel.id}
                    >
                      <div className="customer-hotel-photo-wrap">
                        <img
                          src={hotelCover(hotel) || "/hotel-placeholder.svg"}
                          alt={hotel.name}
                          className="customer-hotel-photo"
                        />

                        <button
                          type="button"
                          className={`customer-favorite-button ${
                            favoriteIds.has(hotel.id) ? "active" : ""
                          }`}
                          aria-label={
                            favoriteIds.has(hotel.id)
                              ? "Bỏ khỏi yêu thích"
                              : "Thêm vào yêu thích"
                          }
                          title={
                            favoriteIds.has(hotel.id)
                              ? "Bỏ khỏi yêu thích"
                              : "Thêm vào yêu thích"
                          }
                          disabled={favoriteBusyId === hotel.id}
                          onClick={() => toggleFavorite(hotel.id)}
                        >
                          <Heart
                            size={20}
                            fill={favoriteIds.has(hotel.id) ? "currentColor" : "none"}
                          />
                        </button>
                      </div>

                      <div className="customer-hotel-card-body">
                        <div className="customer-hotel-info">
                          <button
                            type="button"
                            className="customer-hotel-name"
                            onClick={() =>
                              openHotel(
                                hotel.id,
                              )
                            }
                          >
                            {hotel.name}
                          </button>

                          <div className="customer-hotel-stars">
                            {Array.from({
                              length:
                                Number(
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

                            <span>
                              {hotel.starRating
                                ?? 0}{" "}
                              sao
                            </span>
                          </div>

                          <div className="customer-hotel-location">
                            <MapPin
                              size={16}
                            />

                            <span>
                              {hotel.address},{" "}
                              {hotel.city}
                            </span>
                          </div>

                          <p className="customer-hotel-description">
                            {hotel.description
                              || "Khách sạn cung cấp không gian nghỉ dưỡng tiện nghi và vị trí thuận tiện."}
                          </p>

                          <div className="customer-amenity-list">
                            <span>
                              <Wifi
                                size={15}
                              />
                              Wifi miễn phí
                            </span>

                            <span>
                              <Wind
                                size={15}
                              />
                              Điều hòa
                            </span>

                            <span>
                              Bãi đỗ xe
                            </span>
                          </div>
                        </div>

                        <div className="customer-hotel-action">
                          <div className="customer-rating-block">
                            <div>
                              <strong>
                                {reviewSummaries[hotel.id]?.averageRating != null
                                  ? Number(reviewSummaries[hotel.id].averageRating) >= 9
                                    ? "Tuyệt hảo"
                                    : Number(reviewSummaries[hotel.id].averageRating) >= 8
                                      ? "Rất tốt"
                                      : Number(reviewSummaries[hotel.id].averageRating) >= 7
                                        ? "Tốt"
                                        : "Khá tốt"
                                  : "Chưa có đánh giá"}
                              </strong>

                              <small>
                                {reviewSummaries[hotel.id]?.reviewCount > 0
                                  ? `${reviewSummaries[hotel.id].reviewCount} đánh giá thật`
                                  : "Chờ khách lưu trú đánh giá"}
                              </small>
                            </div>

                            {reviewSummaries[hotel.id]?.averageRating != null ? (
                              <span>
                                {Number(
                                  reviewSummaries[hotel.id].averageRating,
                                ).toFixed(1)}
                              </span>
                            ) : null}
                          </div>

                          <div className="customer-price-block">
                            <small>
                              Giá phòng từ
                            </small>

                            <strong>
                              Liên hệ khách sạn
                            </strong>
                          </div>

                          <button
                            type="button"
                            className="customer-view-room-button"
                            onClick={() =>
                              openHotel(
                                hotel.id,
                              )
                            }
                          >
                            Xem phòng
                          </button>
                        </div>
                      </div>
                    </article>
                  ),
                )
              )}
            </div>

            {visibleHotels.length
              > 0 ? (
              <div className="customer-pagination">
                <button type="button">
                  <ChevronLeft
                    size={17}
                  />
                </button>

                <button
                  type="button"
                  className="active"
                >
                  1
                </button>

                <button type="button">
                  2
                </button>

                <button type="button">
                  <ChevronRight
                    size={17}
                  />
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {mapMode ? (
        <HotelMapOverlay
          hotels={visibleHotels}
          allHotels={hotels}
          reviewSummaries={reviewSummaries}
          favoriteIds={favoriteIds}
          favoriteBusyId={favoriteBusyId}
          filters={filters}
          setFilters={setFilters}
          onToggleStar={toggleStar}
          onToggleFavorite={toggleFavorite}
          onOpenHotel={openHotel}
          onClose={() => setMapMode(false)}
        />
      ) : null}
    </main>
  );
}