import {
  Building2, CalendarDays, ChevronRight, Clock3, MapPin, Search, Users, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HotelSearchBar.css";

const RECENT_SEARCHES_KEY = "enziuroomsRecentDestinationSearches";

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return localDateValue(base);
}

function buildInitialValues(values) {
  const today = localDateValue();
  let checkIn = String(values?.checkIn ?? "");
  let checkOut = String(values?.checkOut ?? "");
  if (checkIn && checkIn < today) checkIn = "";
  if (checkOut && checkOut <= (checkIn || today)) checkOut = "";
  return {
    city: values?.city ?? "",
    checkIn,
    checkOut,
    guests: Number(values?.guests ?? 2),
    rooms: Number(values?.rooms ?? 1),
  };
}

function readRecentSearches() {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function HotelSearchBar({ hotels = [], initialValues, variant = "home" }) {
  const navigate = useNavigate();
  const destinationRef = useRef(null);
  const today = localDateValue();
  const listboxId = `destination-results-${variant}`;
  const [form, setForm] = useState(() => buildInitialValues(initialValues));
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [dateError, setDateError] = useState("");
  const initialCity = initialValues?.city;
  const initialCheckIn = initialValues?.checkIn;
  const initialCheckOut = initialValues?.checkOut;
  const initialGuests = initialValues?.guests;
  const initialRooms = initialValues?.rooms;

  useEffect(() => {
    setForm(buildInitialValues({
      city: initialCity,
      checkIn: initialCheckIn,
      checkOut: initialCheckOut,
      guests: initialGuests,
      rooms: initialRooms,
    }));
  }, [initialCity, initialCheckIn, initialCheckOut, initialGuests, initialRooms]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (destinationRef.current && !destinationRef.current.contains(event.target)) {
        setDestinationOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") setDestinationOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const citySuggestions = useMemo(() => {
    const cities = new Map();
    hotels.forEach((hotel) => {
      const name = String(hotel?.city ?? "").trim();
      if (!name) return;
      const key = normalizeText(name);
      const current = cities.get(key) ?? { id: key, name, count: 0 };
      current.count += 1;
      cities.set(key, current);
    });
    return [...cities.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
      .slice(0, 8);
  }, [hotels]);

  const destinationResults = useMemo(() => {
    const keyword = normalizeText(form.city);
    return {
      cities: citySuggestions.filter((city) => !keyword || normalizeText(city.name).includes(keyword)),
      hotels: keyword
        ? hotels.filter((hotel) => normalizeText([
          hotel.name, hotel.city, hotel.address,
        ].join(" ")).includes(keyword)).slice(0, 6)
        : [],
    };
  }, [citySuggestions, form.city, hotels]);

  const hasKeyword = Boolean(form.city.trim());
  const options = useMemo(() => [
    ...(!hasKeyword ? recentSearches.map((value) => ({ type: "recent", value })) : []),
    ...destinationResults.cities.map((city) => ({ type: "city", value: city.name })),
    ...destinationResults.hotels.map((hotel) => ({ type: "hotel", hotel })),
  ], [destinationResults, hasKeyword, recentSearches]);

  function updateRecentSearches(next) {
    setRecentSearches(next);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }

  function saveRecentSearch(value) {
    const normalizedValue = value.trim();
    if (!normalizedValue) return;
    updateRecentSearches([
      normalizedValue,
      ...recentSearches.filter((item) => normalizeText(item) !== normalizeText(normalizedValue)),
    ].slice(0, 5));
  }

  function selectDestination(value) {
    setForm((current) => ({ ...current, city: value }));
    setDestinationOpen(false);
    setActiveOptionIndex(-1);
  }

  function selectHotel(hotel) {
    saveRecentSearch(hotel.city || hotel.name);
    const params = new URLSearchParams({
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guests: String(form.guests),
      rooms: String(form.rooms),
    });
    navigate(`/hotels/${hotel.id}?${params.toString()}`);
  }

  function activateOption(option) {
    if (!option) return;
    if (option.type === "hotel") selectHotel(option.hotel);
    else selectDestination(option.value);
  }

  function handleComboboxKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setDestinationOpen(true);
      if (!options.length) return;
      setActiveOptionIndex((current) => {
        if (event.key === "ArrowDown") return current >= options.length - 1 ? 0 : current + 1;
        return current <= 0 ? options.length - 1 : current - 1;
      });
    } else if (event.key === "Enter" && destinationOpen && activeOptionIndex >= 0) {
      event.preventDefault();
      activateOption(options[activeOptionIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDestinationOpen(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    if (name === "checkIn") {
      if (value && value < today) {
        setDateError("Ngày nhận phòng không thể trước hôm nay.");
        return;
      }
      setDateError("");
      setForm((current) => ({
        ...current,
        checkIn: value,
        checkOut: value && (!current.checkOut || current.checkOut <= value)
          ? addDays(value, 1)
          : current.checkOut,
      }));
      return;
    }
    if (name === "checkOut") {
      const minimum = form.checkIn ? addDays(form.checkIn, 1) : addDays(today, 1);
      if (value && value < minimum) {
        setDateError(form.checkIn
          ? "Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 ngày."
          : "Ngày trả phòng phải từ ngày mai trở đi.");
        return;
      }
      setDateError("");
    }
    setForm((current) => ({
      ...current,
      [name]: name === "guests" || name === "rooms" ? Number(value) : value,
    }));
    if (name === "city") {
      setDestinationOpen(true);
      setActiveOptionIndex(-1);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (form.checkIn && form.checkIn < today) {
      setDateError("Ngày nhận phòng không thể trước hôm nay.");
      return;
    }
    if (form.checkOut && !form.checkIn) {
      setDateError("Vui lòng chọn ngày nhận phòng trước.");
      return;
    }
    if (form.checkIn && !form.checkOut) {
      setDateError("Vui lòng chọn ngày trả phòng.");
      return;
    }
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) {
      setDateError("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 ngày.");
      return;
    }
    setDateError("");
    const city = form.city.trim();
    if (city) saveRecentSearch(city);
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (form.checkIn) params.set("checkIn", form.checkIn);
    if (form.checkOut) params.set("checkOut", form.checkOut);
    params.set("guests", String(form.guests));
    params.set("rooms", String(form.rooms));
    setDestinationOpen(false);
    navigate(`/hotels?${params.toString()}`);
  }

  const minimumCheckOut = form.checkIn ? addDays(form.checkIn, 1) : addDays(today, 1);
  let optionCursor = 0;

  return (
    <form className={`shared-hotel-search shared-hotel-search-${variant}`} onSubmit={handleSubmit}>
      <div ref={destinationRef} className={`shared-search-field shared-search-location ${destinationOpen ? "is-open" : ""}`}>
        <label htmlFor={`search-city-${variant}`}>Thành phố hoặc khách sạn</label>
        <div className="shared-search-control">
          <MapPin size={22} aria-hidden="true" />
          <input
            id={`search-city-${variant}`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={destinationOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionIndex >= 0 ? `${listboxId}-option-${activeOptionIndex}` : undefined}
            type="text"
            name="city"
            value={form.city}
            onChange={handleChange}
            onKeyDown={handleComboboxKeyDown}
            onFocus={() => setDestinationOpen(true)}
            placeholder="Bạn muốn đi đâu?"
            autoComplete="off"
          />
          {form.city ? (
            <button type="button" className="shared-search-clear" onClick={() => {
              setForm((current) => ({ ...current, city: "" }));
              setDestinationOpen(true);
            }} aria-label="Xóa điểm đến"><X size={17} /></button>
          ) : null}
        </div>

        {destinationOpen ? (
          <div id={listboxId} className="shared-destination-dropdown" role="listbox" aria-label="Gợi ý điểm đến">
            {!hasKeyword && recentSearches.length ? (
              <section className="shared-destination-section" aria-label="Tìm kiếm gần đây">
                <div className="shared-destination-heading">
                  <div><Clock3 size={19} /><strong>Tìm kiếm gần đây</strong></div>
                  <button type="button" onClick={() => {
                    setRecentSearches([]);
                    localStorage.removeItem(RECENT_SEARCHES_KEY);
                  }}>Xóa tất cả</button>
                </div>
                <div className="shared-destination-list">
                  {recentSearches.map((item) => {
                    const index = optionCursor++;
                    return (
                      <div className="shared-destination-recent-row" key={item}>
                        <button
                          id={`${listboxId}-option-${index}`}
                          role="option"
                          aria-selected={activeOptionIndex === index}
                          type="button"
                          className="shared-destination-option"
                          onMouseEnter={() => setActiveOptionIndex(index)}
                          onClick={() => selectDestination(item)}
                        >
                          <span className="shared-destination-icon recent"><Clock3 size={21} /></span>
                          <span className="shared-destination-copy"><strong>{item}</strong><small>{form.guests} khách · {form.rooms} phòng</small></span>
                        </button>
                        <button
                          type="button"
                          className="shared-destination-remove"
                          onClick={() => updateRecentSearches(recentSearches.filter((value) => value !== item))}
                          aria-label={`Xóa tìm kiếm ${item}`}
                        ><X size={16} /></button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="shared-destination-section" aria-label="Kết quả điểm đến">
              <div className="shared-destination-heading">
                <div><Search size={19} /><strong>{hasKeyword ? "Kết quả tìm kiếm" : "Điểm đến đang có khách sạn"}</strong></div>
              </div>
              {!destinationResults.cities.length && !destinationResults.hotels.length ? (
                <div className="shared-destination-empty">
                  <Search size={34} /><strong>Không tìm thấy kết quả</strong>
                  <span>Hãy thử nhập tên thành phố hoặc khách sạn khác.</span>
                </div>
              ) : (
                <div className="shared-destination-list">
                  {destinationResults.cities.map((city) => {
                    const index = optionCursor++;
                    return (
                      <button
                        id={`${listboxId}-option-${index}`}
                        role="option"
                        aria-selected={activeOptionIndex === index}
                        type="button"
                        className="shared-destination-option"
                        key={city.id}
                        onMouseEnter={() => setActiveOptionIndex(index)}
                        onClick={() => selectDestination(city.name)}
                      >
                        <span className="shared-destination-icon"><MapPin size={22} /></span>
                        <span className="shared-destination-copy"><strong>{city.name}</strong><small>{city.count} khách sạn</small></span>
                      </button>
                    );
                  })}
                  {destinationResults.hotels.length ? <div className="shared-destination-divider">Khách sạn phù hợp</div> : null}
                  {destinationResults.hotels.map((hotel) => {
                    const index = optionCursor++;
                    return (
                      <button
                        id={`${listboxId}-option-${index}`}
                        role="option"
                        aria-selected={activeOptionIndex === index}
                        type="button"
                        className="shared-destination-option"
                        key={hotel.id}
                        onMouseEnter={() => setActiveOptionIndex(index)}
                        onClick={() => selectHotel(hotel)}
                      >
                        <span className="shared-destination-icon hotel"><Building2 size={21} /></span>
                        <span className="shared-destination-copy">
                          <strong>{hotel.name}</strong>
                          <small>{[hotel.address, hotel.city].filter(Boolean).join(", ")}</small>
                        </span>
                        <ChevronRight size={18} className="shared-destination-arrow" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <div className="shared-search-field">
        <label htmlFor={`search-check-in-${variant}`}>Ngày nhận phòng</label>
        <div className="shared-search-control"><CalendarDays size={22} aria-hidden="true" /><input id={`search-check-in-${variant}`} type="date" name="checkIn" value={form.checkIn} min={today} onChange={handleChange} /></div>
      </div>
      <div className="shared-search-field">
        <label htmlFor={`search-check-out-${variant}`}>Ngày trả phòng</label>
        <div className="shared-search-control"><CalendarDays size={22} aria-hidden="true" /><input id={`search-check-out-${variant}`} type="date" name="checkOut" value={form.checkOut} min={minimumCheckOut} onChange={handleChange} /></div>
      </div>
      {dateError ? <div className="shared-search-date-error" role="alert">{dateError}</div> : null}
      <div className="shared-search-field">
        <label htmlFor={`search-guests-${variant}`}>Số khách</label>
        <div className="shared-search-control"><Users size={22} aria-hidden="true" /><select id={`search-guests-${variant}`} name="guests" value={form.guests} onChange={handleChange}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} khách</option>)}</select></div>
      </div>
      <div className="shared-search-field shared-search-rooms">
        <label htmlFor={`search-rooms-${variant}`}>Số phòng</label>
        <div className="shared-search-control"><select id={`search-rooms-${variant}`} name="rooms" value={form.rooms} onChange={handleChange}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} phòng</option>)}</select></div>
      </div>
      <button type="submit" className="shared-search-submit"><Search size={22} />Tìm kiếm</button>
    </form>
  );
}
