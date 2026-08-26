import {
  ChevronRight,
  Heart,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  X,
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
import { EmptyState, Pagination } from "../../components/ui";
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

const PAGE_SIZE = 6;

function tomorrow(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + 1 + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function amenityLabel(amenity) {
  if (typeof amenity === "string") return amenity.trim();
  return String(amenity?.name ?? amenity?.label ?? "").trim();
}

function compactHotelDescription(value, maxLength = 210) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("! "),
    shortened.lastIndexOf("? "),
  );

  if (sentenceEnd >= Math.floor(maxLength * 0.58)) {
    return `${shortened.slice(0, sentenceEnd + 1).trim()}…`;
  }

  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}…`;
}

export default function HotelsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isCustomer = isAuthenticated
    && String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase() === "CUSTOMER";
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

  const [filterOpen, setFilterOpen] =
    useState(false);

  const [currentPage, setCurrentPage] =
    useState(1);

  const [catalogVersion, setCatalogVersion] =
    useState(0);

  const [filters, setFilters] =
    useState({
      stars: [],
      amenities: [],
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
        adults: Number(
          searchParams.get("adults")
          ?? searchParams.get("guests")
          ?? 2,
        ),
        children: Number(
          searchParams.get("children")
          ?? 0,
        ),
        guests: Number(
          searchParams.get("guests")
          ?? ((Number(searchParams.get("adults") ?? 2)) + (Number(searchParams.get("children") ?? 0))),
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
    if (!filterOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") setFilterOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [filterOpen]);

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

  const availableAmenities = useMemo(() => {
    const values = new Map();
    hotels.forEach((hotel) => {
      (Array.isArray(hotel?.amenities) ? hotel.amenities : []).forEach((amenity) => {
        const label = amenityLabel(amenity);
        if (label) values.set(normalizeText(label), label);
      });
    });
    return [...values.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "vi"))
      .map(([id, label]) => ({ id, label }));
  }, [hotels]);

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

          const hotelAmenities = new Set(
            (Array.isArray(hotel?.amenities) ? hotel.amenities : [])
              .map((amenity) => normalizeText(amenityLabel(amenity)))
              .filter(Boolean),
          );

          const amenityMatch = (filters.amenities ?? []).every((amenity) => hotelAmenities.has(amenity));

          return (
            cityMatch
            && starMatch
            && amenityMatch
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

  const totalPages = Math.max(1, Math.ceil(visibleHotels.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedHotels = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return visibleHotels.slice(start, start + PAGE_SIZE);
  }, [safeCurrentPage, visibleHotels]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchValues.city, filters.stars, filters.amenities, filters.sort]);

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

  function toggleAmenity(amenity) {
    setFilters((current) => ({
      ...current,
      amenities: (current.amenities ?? []).includes(amenity)
        ? current.amenities.filter((item) => item !== amenity)
        : [...(current.amenities ?? []), amenity],
    }));
  }

  function resetFilters() {
    setFilters({
      stars: [],
      amenities: [],
      sort: "recommended",
    });
    setCurrentPage(1);
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
          searchValues.adults + searchValues.children,
        ),
        adults: String(
          searchValues.adults,
        ),
        children: String(
          searchValues.children,
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

        <button
          type="button"
          className="customer-mobile-filter-toggle"
          aria-expanded={filterOpen}
          aria-controls="customer-hotel-filters"
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal size={18} />
          Bộ lọc
          {filters.stars.length + (filters.amenities?.length ?? 0) > 0 ? (
            <span>{filters.stars.length + (filters.amenities?.length ?? 0)}</span>
          ) : null}
        </button>

        {filterOpen ? (
          <button
            type="button"
            className="customer-filter-backdrop"
            aria-label="Đóng bộ lọc"
            onClick={() => setFilterOpen(false)}
          />
        ) : null}

        <div className="customer-results-layout">
          <aside
            id="customer-hotel-filters"
            className={`customer-filter-card ${filterOpen ? "is-open" : ""}`}
            aria-label="Bộ lọc khách sạn"
          >
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
                onClick={resetFilters}
              >
                Xóa tất cả
              </button>

              <button
                type="button"
                className="customer-filter-close"
                aria-label="Đóng bộ lọc"
                onClick={() => setFilterOpen(false)}
              >
                <X size={19} />
              </button>
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

            {availableAmenities.length ? (
              <div className="customer-filter-group">
                <h3>Tiện nghi khách sạn</h3>
                {availableAmenities.map((amenity) => (
                  <label className="customer-checkbox-row" key={amenity.id}>
                    <input
                      type="checkbox"
                      checked={(filters.amenities ?? []).includes(amenity.id)}
                      onChange={() => toggleAmenity(amenity.id)}
                    />
                    <span>{amenity.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
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

                <label className="customer-sort-control">
                  <span className="sr-only">Sắp xếp khách sạn</span>
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
                    Thứ tự mặc định
                  </option>

                  <option value="stars-desc">
                    Số sao cao nhất
                  </option>

                  <option value="name-asc">
                    Tên khách sạn A–Z
                  </option>
                </select>
                </label>
              </div>

              <button
                type="button"
                className="customer-map-button"
                onClick={() => setMapMode(true)}
              >
                <MapIcon size={18} />
                Xem bản đồ
              </button>
            </div>

            <div className="customer-hotel-list">
              {visibleHotels.length
                === 0 ? (
                <EmptyState
                  className="customer-empty-results"
                  icon={<Search size={40} />}
                  title="Không tìm thấy khách sạn phù hợp"
                  description="Hãy thử thay đổi thành phố hoặc bỏ bớt bộ lọc."
                />
              ) : (
                paginatedHotels.map(
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

                          {hotel.description ? (
                            <p
                              className="customer-hotel-description"
                              title={hotel.description}
                            >
                              {compactHotelDescription(hotel.description)}
                            </p>
                          ) : null}

                          {Array.isArray(hotel.amenities) && hotel.amenities.length ? (
                            <div className="customer-amenity-list" aria-label="Tiện nghi">
                              {hotel.amenities.slice(0, 4).map((amenity) => (
                                <span key={amenityLabel(amenity)}>{amenityLabel(amenity)}</span>
                              ))}
                            </div>
                          ) : null}
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
                            <small>Giá phòng</small>
                            <strong>Xem loại phòng để biết giá</strong>
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

            {visibleHotels.length > PAGE_SIZE ? (
              <Pagination
                className="customer-pagination"
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
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