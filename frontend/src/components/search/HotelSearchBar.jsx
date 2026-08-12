import {
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import "./HotelSearchBar.css";

const RECENT_SEARCHES_KEY =
  "enziuroomsRecentDestinationSearches";

const trendingDestinations = [
  {
    id: "ho-chi-minh",
    name: "TP. Hồ Chí Minh",
    subtitle: "Việt Nam",
    searchValue: "Hồ Chí Minh",
  },
  {
    id: "vung-tau",
    name: "Vũng Tàu",
    subtitle: "Việt Nam",
    searchValue: "Vũng Tàu",
  },
  {
    id: "nha-trang",
    name: "Nha Trang",
    subtitle: "Việt Nam",
    searchValue: "Nha Trang",
  },
  {
    id: "da-lat",
    name: "Đà Lạt",
    subtitle: "Việt Nam",
    searchValue: "Đà Lạt",
  },
  {
    id: "ha-noi",
    name: "Hà Nội",
    subtitle: "Việt Nam",
    searchValue: "Hà Nội",
  },
  {
    id: "da-nang",
    name: "Đà Nẵng",
    subtitle: "Việt Nam",
    searchValue: "Đà Nẵng",
  },
  {
    id: "phu-quoc",
    name: "Phú Quốc",
    subtitle: "Kiên Giang, Việt Nam",
    searchValue: "Phú Quốc",
  },
  {
    id: "hoi-an",
    name: "Hội An",
    subtitle: "Quảng Nam, Việt Nam",
    searchValue: "Hội An",
  },
];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readRecentSearches() {
  try {
    const storedValue =
      localStorage.getItem(
        RECENT_SEARCHES_KEY,
      );

    if (!storedValue) {
      return [];
    }

    const parsedValue =
      JSON.parse(storedValue);

    return Array.isArray(parsedValue)
      ? parsedValue
      : [];
  } catch {
    return [];
  }
}

function buildInitialValues(initialValues) {
  return {
    city:
      initialValues?.city
      ?? "",
    checkIn:
      initialValues?.checkIn
      ?? "",
    checkOut:
      initialValues?.checkOut
      ?? "",
    guests: Number(
      initialValues?.guests
      ?? 2,
    ),
    rooms: Number(
      initialValues?.rooms
      ?? 1,
    ),
  };
}

export default function HotelSearchBar({
  hotels = [],
  initialValues,
  variant = "home",
}) {
  const navigate = useNavigate();
  const destinationRef = useRef(null);

  const [form, setForm] = useState(
    () =>
      buildInitialValues(
        initialValues,
      ),
  );

  const [
    destinationOpen,
    setDestinationOpen,
  ] = useState(false);

  const [
    recentSearches,
    setRecentSearches,
  ] = useState(readRecentSearches);

  useEffect(() => {
    setForm(
      buildInitialValues(
        initialValues,
      ),
    );
  }, [
    initialValues?.city,
    initialValues?.checkIn,
    initialValues?.checkOut,
    initialValues?.guests,
    initialValues?.rooms,
  ]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        destinationRef.current
        && !destinationRef.current.contains(
          event.target,
        )
      ) {
        setDestinationOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDestinationOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, []);

  const destinationResults =
    useMemo(() => {
      const keyword =
        normalizeText(form.city);

      if (!keyword) {
        return {
          cities:
            trendingDestinations,
          hotels: [],
        };
      }

      const cities =
        trendingDestinations.filter(
          (destination) =>
            normalizeText(
              [
                destination.name,
                destination.subtitle,
                destination.searchValue,
              ].join(" "),
            ).includes(keyword),
        );

      const matchingHotels = hotels
        .filter((hotel) =>
          normalizeText(
            [
              hotel.name,
              hotel.city,
              hotel.address,
            ].join(" "),
          ).includes(keyword),
        )
        .slice(0, 6);

      return {
        cities,
        hotels: matchingHotels,
      };
    }, [
      form.city,
      hotels,
    ]);

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        name === "guests"
        || name === "rooms"
          ? Number(value)
          : value,
    }));

    if (name === "city") {
      setDestinationOpen(true);
    }
  }

  function saveRecentSearch(value) {
    const normalizedValue =
      value.trim();

    if (!normalizedValue) {
      return;
    }

    const nextSearches = [
      normalizedValue,
      ...recentSearches.filter(
        (item) =>
          normalizeText(item)
          !== normalizeText(
            normalizedValue,
          ),
      ),
    ].slice(0, 5);

    setRecentSearches(
      nextSearches,
    );

    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(
        nextSearches,
      ),
    );
  }

  function selectDestination(value) {
    setForm((current) => ({
      ...current,
      city: value,
    }));

    setDestinationOpen(false);
  }

  function selectHotel(hotel) {
    saveRecentSearch(
      hotel.city || hotel.name,
    );

    setDestinationOpen(false);

    const params =
      new URLSearchParams({
        checkIn:
          form.checkIn,
        checkOut:
          form.checkOut,
        guests: String(
          form.guests,
        ),
        rooms: String(
          form.rooms,
        ),
      });

    navigate(
      `/hotels/${hotel.id}?${params.toString()}`,
    );
  }

  function removeRecentSearch(
    value,
    event,
  ) {
    event.stopPropagation();

    const nextSearches =
      recentSearches.filter(
        (item) =>
          normalizeText(item)
          !== normalizeText(value),
      );

    setRecentSearches(
      nextSearches,
    );

    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(
        nextSearches,
      ),
    );
  }

  function clearRecentSearches() {
    setRecentSearches([]);

    localStorage.removeItem(
      RECENT_SEARCHES_KEY,
    );
  }

  function handleSubmit(event) {
    event.preventDefault();

    const city =
      form.city.trim();

    if (city) {
      saveRecentSearch(city);
    }

    const params =
      new URLSearchParams();

    if (city) {
      params.set("city", city);
    }

    if (form.checkIn) {
      params.set(
        "checkIn",
        form.checkIn,
      );
    }

    if (form.checkOut) {
      params.set(
        "checkOut",
        form.checkOut,
      );
    }

    params.set(
      "guests",
      String(form.guests),
    );

    params.set(
      "rooms",
      String(form.rooms),
    );

    setDestinationOpen(false);

    navigate(
      `/hotels?${params.toString()}`,
    );
  }

  const hasKeyword =
    Boolean(form.city.trim());

  const hasResults =
    destinationResults.cities
      .length > 0
    || destinationResults.hotels
      .length > 0;

  return (
    <form
      className={
        `shared-hotel-search `
        + `shared-hotel-search-${variant}`
      }
      onSubmit={handleSubmit}
    >
      <div
        ref={destinationRef}
        className={
          `shared-search-field `
          + `shared-search-location ${
            destinationOpen
              ? "is-open"
              : ""
          }`
        }
      >
        <label htmlFor={`search-city-${variant}`}>
          Thành phố hoặc khách sạn
        </label>

        <div className="shared-search-control">
          <MapPin size={22} />

          <input
            id={`search-city-${variant}`}
            type="text"
            name="city"
            value={form.city}
            onChange={handleChange}
            onFocus={() =>
              setDestinationOpen(true)
            }
            placeholder="Bạn muốn đi đâu?"
            autoComplete="off"
          />

          {form.city ? (
            <button
              type="button"
              className="shared-search-clear"
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  city: "",
                }));

                setDestinationOpen(
                  true,
                );
              }}
              aria-label="Xóa điểm đến"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>

        {destinationOpen ? (
          <div className="shared-destination-dropdown">
            {!hasKeyword
            && recentSearches.length
              > 0 ? (
              <section className="shared-destination-section">
                <div className="shared-destination-heading">
                  <div>
                    <Clock3 size={19} />
                    <strong>
                      Tiếp tục tìm kiếm
                    </strong>
                  </div>

                  <button
                    type="button"
                    onClick={
                      clearRecentSearches
                    }
                  >
                    Xóa tất cả
                  </button>
                </div>

                <div className="shared-destination-list">
                  {recentSearches.map(
                    (item) => (
                      <button
                        type="button"
                        className="shared-destination-option"
                        key={item}
                        onClick={() =>
                          selectDestination(
                            item,
                          )
                        }
                      >
                        <span className="shared-destination-icon recent">
                          <Clock3 size={21} />
                        </span>

                        <span className="shared-destination-copy">
                          <strong>
                            {item}
                          </strong>

                          <small>
                            {form.guests} khách ·{" "}
                            {form.rooms} phòng
                          </small>
                        </span>

                        <span
                          role="button"
                          tabIndex={0}
                          className="shared-destination-remove"
                          onClick={(event) =>
                            removeRecentSearch(
                              item,
                              event,
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key
                                === "Enter"
                              || event.key
                                === " "
                            ) {
                              removeRecentSearch(
                                item,
                                event,
                              );
                            }
                          }}
                        >
                          <X size={16} />
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            <section className="shared-destination-section">
              <div className="shared-destination-heading">
                <div>
                  {hasKeyword ? (
                    <Search size={19} />
                  ) : (
                    <TrendingUp
                      size={19}
                    />
                  )}

                  <strong>
                    {hasKeyword
                      ? "Kết quả tìm kiếm"
                      : "Các điểm đến thịnh hành"}
                  </strong>
                </div>
              </div>

              {!hasResults ? (
                <div className="shared-destination-empty">
                  <Search size={34} />

                  <strong>
                    Không tìm thấy kết quả
                  </strong>

                  <span>
                    Hãy thử nhập tên thành
                    phố hoặc khách sạn khác.
                  </span>
                </div>
              ) : (
                <div className="shared-destination-list">
                  {destinationResults
                    .cities
                    .map(
                      (destination) => (
                        <button
                          type="button"
                          className="shared-destination-option"
                          key={
                            destination.id
                          }
                          onClick={() =>
                            selectDestination(
                              destination.searchValue,
                            )
                          }
                        >
                          <span className="shared-destination-icon">
                            <MapPin
                              size={22}
                            />
                          </span>

                          <span className="shared-destination-copy">
                            <strong>
                              {
                                destination.name
                              }
                            </strong>

                            <small>
                              {
                                destination.subtitle
                              }
                            </small>
                          </span>
                        </button>
                      ),
                    )}

                  {destinationResults
                    .hotels.length > 0 ? (
                    <>
                      <div className="shared-destination-divider">
                        Khách sạn phù hợp
                      </div>

                      {destinationResults
                        .hotels
                        .map((hotel) => (
                          <button
                            type="button"
                            className="shared-destination-option"
                            key={hotel.id}
                            onClick={() =>
                              selectHotel(
                                hotel,
                              )
                            }
                          >
                            <span className="shared-destination-icon hotel">
                              <Building2
                                size={21}
                              />
                            </span>

                            <span className="shared-destination-copy">
                              <strong>
                                {hotel.name}
                              </strong>

                              <small>
                                {[
                                  hotel.address,
                                  hotel.city,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(", ")}
                              </small>
                            </span>

                            <ChevronRight
                              size={18}
                              className="shared-destination-arrow"
                            />
                          </button>
                        ))}
                    </>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <div className="shared-search-field">
        <label htmlFor={`search-check-in-${variant}`}>
          Ngày nhận phòng
        </label>

        <div className="shared-search-control">
          <CalendarDays size={22} />

          <input
            id={`search-check-in-${variant}`}
            type="date"
            name="checkIn"
            value={form.checkIn}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="shared-search-field">
        <label htmlFor={`search-check-out-${variant}`}>
          Ngày trả phòng
        </label>

        <div className="shared-search-control">
          <CalendarDays size={22} />

          <input
            id={`search-check-out-${variant}`}
            type="date"
            name="checkOut"
            value={form.checkOut}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="shared-search-field">
        <label htmlFor={`search-guests-${variant}`}>
          Số khách
        </label>

        <div className="shared-search-control">
          <Users size={22} />

          <select
            id={`search-guests-${variant}`}
            name="guests"
            value={form.guests}
            onChange={handleChange}
          >
            {[1, 2, 3, 4, 5, 6].map(
              (count) => (
                <option
                  key={count}
                  value={count}
                >
                  {count} khách
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div className="shared-search-field shared-search-rooms">
        <label htmlFor={`search-rooms-${variant}`}>
          Số phòng
        </label>

        <div className="shared-search-control">
          <select
            id={`search-rooms-${variant}`}
            name="rooms"
            value={form.rooms}
            onChange={handleChange}
          >
            {[1, 2, 3, 4].map(
              (count) => (
                <option
                  key={count}
                  value={count}
                >
                  {count} phòng
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="shared-search-submit"
      >
        <Search size={22} />
        Tìm kiếm
      </button>
    </form>
  );
}