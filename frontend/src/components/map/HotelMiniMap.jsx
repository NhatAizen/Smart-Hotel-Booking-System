import {
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildHotelAddress,
  hotelStoredPosition,
  loadLeaflet,
} from "../../utils/openStreetMap";
import "./HotelMiniMap.css";

function markerHtml(type = "hotel") {
  return `
    <div class="enziu-route-pin ${type === "origin" ? "origin" : "hotel"}">
      <span></span>
    </div>
  `;
}

function createMarkerIcon(L, type = "hotel") {
  return L.divIcon({
    className: "enziu-mini-map-marker-shell",
    html: markerHtml(type),
    iconSize: [42, 50],
    iconAnchor: [21, 46],
  });
}

function formatDistance(meters) {
  const value = Number(meters ?? 0);
  if (!Number.isFinite(value)) return "";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(1, Math.round(Number(seconds ?? 0) / 60));
  if (totalMinutes < 60) return `${totalMinutes} phút`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function buildPhotonSuggestion(feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties ?? {};

  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const mainParts = [
    properties.name,
    properties.housenumber && properties.street
      ? `${properties.housenumber} ${properties.street}`
      : properties.street,
  ].filter(Boolean);

  const secondaryParts = [
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ].filter(Boolean);

  const mainLabel = mainParts[0] || secondaryParts[0] || "Địa điểm";
  const secondaryLabel = secondaryParts
    .filter((item) => item !== mainLabel)
    .join(", ");

  const displayName = [
    mainLabel,
    secondaryLabel,
  ].filter(Boolean).join(", ");

  return {
    lat,
    lng,
    displayName,
    mainLabel,
    secondaryLabel,
  };
}

function stripVietnameseDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function buildSuggestionQueries(query, contextLabel = "") {
  const original = String(query ?? "").trim().replace(/\s+/g, " ");
  if (!original) return [];

  const withoutGenericPrefix = original
    .replace(
      /^(bệnh\s*viện|benh\s*vien|bv|hospital|trường\s*đại\s*học|truong\s*dai\s*hoc|đại\s*học|dai\s*hoc|chợ|cho|sân\s*bay|san\s*bay)\s+/i,
      "",
    )
    .trim();

  const ascii = stripVietnameseDiacritics(original);
  const asciiWithoutPrefix = stripVietnameseDiacritics(withoutGenericPrefix);

  const words = original.split(/\s+/);
  const tail = words.length >= 2 ? words.slice(-2).join(" ") : original;
  const asciiTail = stripVietnameseDiacritics(tail);

  const context = String(contextLabel ?? "").trim().replace(/\s+/g, " ");
  const asciiContext = stripVietnameseDiacritics(context);

  return [
    original,
    context ? `${original}, ${context}` : "",
    withoutGenericPrefix,
    context && withoutGenericPrefix ? `${withoutGenericPrefix}, ${context}` : "",
    ascii,
    asciiContext ? `${ascii}, ${asciiContext}` : "",
    asciiWithoutPrefix,
    tail,
    asciiTail,
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 8);
}

async function fetchPhotonSuggestions(
  searchText,
  signal,
  focusPosition,
  relaxed = false,
) {
  // Important: do NOT force `lang=vi` here.
  // Public Photon instances only support languages imported by that server.
  // We keep Vietnamese in the query itself and let Photon return local OSM names.
  const params = new URLSearchParams({
    q: searchText,
    limit: "10",
  });

  if (!relaxed) {
    params.set("countrycode", "VN");
  }

  if (
    Number.isFinite(Number(focusPosition?.lat))
    && Number.isFinite(Number(focusPosition?.lng))
  ) {
    params.set("lat", String(focusPosition.lat));
    params.set("lon", String(focusPosition.lng));
    params.set("zoom", "9");
    params.set("location_bias_scale", relaxed ? "0.55" : "0.35");
  }

  const response = await fetch(
    `https://photon.komoot.io/api/?${params.toString()}`,
    {
      signal,
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = new Error(`Photon autocomplete HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return Array.isArray(payload?.features) ? payload.features : [];
}

async function searchOriginSuggestions(query, signal, focusPosition, contextLabel) {
  const trimmed = String(query ?? "").trim();
  if (trimmed.length < 2) return [];

  const searchQueries = buildSuggestionQueries(trimmed, contextLabel);
  const collected = [];

  // Try the exact Vietnamese text first. If it is not enough, progressively
  // try a shorter POI name and a no-diacritic variant. This fixes cases such
  // as "Bệnh viện Chợ Rẫy" where a provider may index only "Chợ Rẫy".
  for (const searchText of searchQueries) {
    if (signal?.aborted) break;

    try {
      let features = [];

      try {
        features = await fetchPhotonSuggestions(
          searchText,
          signal,
          focusPosition,
          false,
        );
      } catch (error) {
        if (error?.name === "AbortError") throw error;

        // Some public Photon deployments can reject an optional filter.
        // Retry the same text with a more relaxed request instead of showing
        // "no suggestions" immediately.
        features = await fetchPhotonSuggestions(
          searchText,
          signal,
          focusPosition,
          true,
        );
      }

      for (const feature of features) {
        const code = String(feature?.properties?.countrycode ?? "").toUpperCase();
        if (code && code !== "VN") continue;

        const suggestion = buildPhotonSuggestion(feature);
        if (!suggestion) continue;

        const duplicate = collected.some(
          (item) =>
            Math.abs(item.lat - suggestion.lat) < 0.00002
            && Math.abs(item.lng - suggestion.lng) < 0.00002,
        );

        if (!duplicate) {
          collected.push(suggestion);
        }

        if (collected.length >= 6) break;
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Continue to the next query variant.
    }

    if (collected.length >= 6) break;
  }

  // Final broad retry with the exact user text. This protects the UI from
  // over-restrictive country/location filters on the public demo server.
  if (collected.length === 0 && !signal?.aborted) {
    try {
      const broadFeatures = await fetchPhotonSuggestions(
        trimmed,
        signal,
        null,
        true,
      );

      for (const feature of broadFeatures) {
        const suggestion = buildPhotonSuggestion(feature);
        if (!suggestion) continue;

        const code = String(feature?.properties?.countrycode ?? "").toUpperCase();
        const looksVietnamese =
          !code
          || code === "VN"
          || /việt nam|vietnam|hồ chí minh|ho chi minh|sài gòn|saigon/i.test(
            suggestion.displayName,
          );

        if (!looksVietnamese) continue;

        const duplicate = collected.some(
          (item) =>
            Math.abs(item.lat - suggestion.lat) < 0.00002
            && Math.abs(item.lng - suggestion.lng) < 0.00002,
        );

        if (!duplicate) collected.push(suggestion);
        if (collected.length >= 6) break;
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }

  return collected.slice(0, 6);
}

function OriginSuggestions({
  items,
  loading,
  query,
  onSelect,
}) {
  if (String(query ?? "").trim().length < 2) return null;

  return (
    <div className="hotel-route-suggestions" role="listbox">
      {loading ? (
        <div className="hotel-route-suggestion-state">Đang tìm địa chỉ...</div>
      ) : items.length > 0 ? (
        items.map((item) => (
          <button
            type="button"
            key={`${item.lat}-${item.lng}-${item.displayName}`}
            className="hotel-route-suggestion"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
          >
            <MapPin size={17} />
            <span>
              <strong>{item.mainLabel}</strong>
              {item.secondaryLabel ? <small>{item.secondaryLabel}</small> : null}
            </span>
          </button>
        ))
      ) : (
        <div className="hotel-route-suggestion-state">
          Chưa tìm thấy gợi ý. Thử gõ ngắn hơn, ví dụ “Chợ Rẫy” hoặc thêm “Hồ Chí Minh”.
        </div>
      )}
    </div>
  );
}

async function geocodeOrigin(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    throw new Error("Nhập địa điểm xuất phát trước khi xem khoảng cách.");
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    limit: "5",
    countrycodes: "vn",
    "accept-language": "vi",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error("Không thể tìm địa điểm xuất phát lúc này.");
  }

  const result = await response.json();
  const first = Array.isArray(result) ? result[0] : null;

  if (!first) {
    throw new Error("Không tìm thấy địa điểm này. Hãy nhập địa chỉ cụ thể hơn.");
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: first.display_name || trimmed,
  };
}

async function fetchDrivingRoute(origin, destination) {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinates}`
      + "?overview=full&geometries=geojson&steps=false",
  );

  if (!response.ok) {
    throw new Error("Không thể tính tuyến đường lúc này.");
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];

  if (payload?.code !== "Ok" || !route?.geometry) {
    throw new Error("Không tìm được tuyến đường phù hợp giữa hai địa điểm.");
  }

  return route;
}

export function HotelMiniMapCanvas({
  hotel,
  height = 190,
  zoom = 16,
  interactive = false,
}) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!nodeRef.current) return;

      const position = hotelStoredPosition(hotel);
      if (!position) {
        setStatus("missing");
        return;
      }

      setStatus("loading");

      try {
        const L = await loadLeaflet();
        if (cancelled || !nodeRef.current) return;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const map = L.map(nodeRef.current, {
          center: [position.lat, position.lng],
          zoom,
          zoomControl: interactive,
          attributionControl: true,
          dragging: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          touchZoom: interactive,
          boxZoom: interactive,
          keyboard: interactive,
          tap: interactive,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.marker([position.lat, position.lng], {
          icon: createMarkerIcon(L, "hotel"),
        })
          .addTo(map)
          .bindTooltip(hotel?.name ?? "Khách sạn", {
            direction: "top",
            offset: [0, -38],
            permanent: false,
          });

        mapRef.current = map;
        window.setTimeout(() => {
          map.invalidateSize();
          map.setView([position.lat, position.lng], zoom, { animate: false });
        }, 60);

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [hotel, interactive, zoom]);

  if (status === "missing") {
    return (
      <div className="hotel-mini-map-empty" style={{ height }}>
        <MapPin size={28} />
        <span>Khách sạn chưa cập nhật vị trí trên bản đồ.</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="hotel-mini-map-empty" style={{ height }}>
        <MapPin size={28} />
        <span>Không thể tải bản đồ lúc này.</span>
      </div>
    );
  }

  return (
    <div className="hotel-mini-map-canvas-wrap" style={{ height }}>
      <div ref={nodeRef} className="hotel-mini-map-canvas" />
      {status === "loading" ? (
        <div className="hotel-mini-map-loading">Đang tải bản đồ...</div>
      ) : null}
    </div>
  );
}

export function HotelMapModal({
  hotel,
  reviewSummary,
  previewImage,
  onClose,
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const originMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);

  const [originQuery, setOriginQuery] = useState("");
  const [origin, setOrigin] = useState(null);
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [activeOriginInput, setActiveOriginInput] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [mapStatus, setMapStatus] = useState("loading");

  const hotelPosition = useMemo(() => hotelStoredPosition(hotel), [hotel]);
  const hotelAddress = useMemo(() => buildHotelAddress(hotel), [hotel]);

  const autocompleteContext = useMemo(
    () =>
      [hotel?.district, hotel?.city || "Hồ Chí Minh", "Việt Nam"]
        .filter(Boolean)
        .join(", "),
    [hotel?.district, hotel?.city],
  );

  useEffect(() => {
    const query = String(originQuery ?? "").trim();

    if (!activeOriginInput || query.length < 2) {
      setOriginSuggestions([]);
      setSuggestionsBusy(false);
      return undefined;
    }

    if (selectedOrigin?.displayName === originQuery) {
      setOriginSuggestions([]);
      setSuggestionsBusy(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsBusy(true);

      try {
        const items = await searchOriginSuggestions(
          query,
          controller.signal,
          hotelPosition,
          autocompleteContext,
        );
        setOriginSuggestions(items);
      } catch (error) {
        if (error?.name !== "AbortError") {
          setOriginSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionsBusy(false);
        }
      }
    }, 380);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeOriginInput, originQuery, selectedOrigin?.displayName, hotelPosition, autocompleteContext]);

  function handleOriginQueryChange(value, source) {
    setOriginQuery(value);
    setSelectedOrigin(null);
    setActiveOriginInput(source);
    setRouteError("");
  }

  function handleOriginSuggestionSelect(item) {
    setOriginQuery(item.displayName);
    setSelectedOrigin(item);
    setOriginSuggestions([]);
    setActiveOriginInput(null);
    setRouteError("");
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!mapNodeRef.current || !hotelPosition) {
        setMapStatus("missing");
        return;
      }

      try {
        const L = await loadLeaflet();
        if (cancelled || !mapNodeRef.current) return;

        leafletRef.current = L;

        const map = L.map(mapNodeRef.current, {
          center: [hotelPosition.lat, hotelPosition.lng],
          zoom: 15,
          zoomControl: true,
          attributionControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.marker([hotelPosition.lat, hotelPosition.lng], {
          icon: createMarkerIcon(L, "hotel"),
        })
          .addTo(map)
          .bindPopup(
            `<strong>${String(hotel?.name ?? "Khách sạn").replace(/[<>]/g, "")}</strong>`,
          );

        mapRef.current = map;
        window.setTimeout(() => {
          map.invalidateSize();
          map.setView([hotelPosition.lat, hotelPosition.lng], 15, {
            animate: false,
          });
        }, 70);

        setMapStatus("ready");
      } catch {
        if (!cancelled) setMapStatus("error");
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      leafletRef.current = null;
      originMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, [hotel?.id, hotel?.name, hotelPosition]);

  function drawRoute(nextOrigin, nextRoute) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !hotelPosition) return;

    if (originMarkerRef.current) {
      map.removeLayer(originMarkerRef.current);
      originMarkerRef.current = null;
    }

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    originMarkerRef.current = L.marker(
      [nextOrigin.lat, nextOrigin.lng],
      { icon: createMarkerIcon(L, "origin") },
    )
      .addTo(map)
      .bindTooltip("Điểm xuất phát", {
        direction: "top",
        offset: [0, -38],
      });

    routeLayerRef.current = L.geoJSON(nextRoute.geometry, {
      style: {
        color: "#0874df",
        weight: 6,
        opacity: 0.88,
      },
    }).addTo(map);

    const bounds = L.latLngBounds([
      [nextOrigin.lat, nextOrigin.lng],
      [hotelPosition.lat, hotelPosition.lng],
    ]);

    routeLayerRef.current.eachLayer((layer) => {
      if (layer.getBounds) bounds.extend(layer.getBounds());
    });

    map.fitBounds(bounds.pad(0.14), {
      animate: true,
      maxZoom: 16,
    });
  }

  async function handleRouteSearch(event) {
    event?.preventDefault?.();
    if (!hotelPosition) return;

    setRouteBusy(true);
    setRouteError("");

    try {
      const nextOrigin =
        selectedOrigin?.displayName === originQuery
          ? selectedOrigin
          : await geocodeOrigin(originQuery);
      const nextRoute = await fetchDrivingRoute(nextOrigin, hotelPosition);
      setOrigin(nextOrigin);
      setRoute(nextRoute);
      drawRoute(nextOrigin, nextRoute);
    } catch (error) {
      setRouteError(error?.message ?? "Không thể tính khoảng cách lúc này.");
    } finally {
      setRouteBusy(false);
    }
  }

  function handleCurrentLocation() {
    if (!navigator.geolocation) {
      setRouteError("Trình duyệt không hỗ trợ lấy vị trí hiện tại.");
      return;
    }

    setRouteBusy(true);
    setRouteError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const nextOrigin = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            displayName: "Vị trí hiện tại của bạn",
          };
          const nextRoute = await fetchDrivingRoute(nextOrigin, hotelPosition);
          setOriginQuery("Vị trí hiện tại của bạn");
          setSelectedOrigin(nextOrigin);
          setOriginSuggestions([]);
          setActiveOriginInput(null);
          setOrigin(nextOrigin);
          setRoute(nextRoute);
          drawRoute(nextOrigin, nextRoute);
        } catch (error) {
          setRouteError(error?.message ?? "Không thể tính khoảng cách lúc này.");
        } finally {
          setRouteBusy(false);
        }
      },
      () => {
        setRouteBusy(false);
        setRouteError("Không thể lấy vị trí hiện tại. Hãy cho phép quyền vị trí hoặc nhập địa chỉ.");
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  return (
    <div
      className="hotel-route-map-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Bản đồ ${hotel?.name ?? "khách sạn"}`}
    >
      <aside className="hotel-route-map-sidebar">
        <div className="hotel-route-hotel-card">
          {previewImage ? (
            <img src={previewImage} alt={hotel?.name ?? "Khách sạn"} />
          ) : null}
          <div>
            <h2>{hotel?.name}</h2>
            {Number(reviewSummary?.reviewCount ?? 0) > 0 ? (
              <p>
                <strong>{Number(reviewSummary.averageRating ?? 0).toFixed(1)}</strong>
                <span>{Number(reviewSummary.reviewCount)} đánh giá</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="hotel-route-address">
          <MapPin size={17} />
          <span>{hotelAddress}</span>
        </div>

        <section className="hotel-route-distance-card">
          <span className="hotel-route-kicker">XEM KHOẢNG CÁCH</span>
          <h3>Bạn đi từ đâu?</h3>
          <p>Nhập địa điểm xuất phát để xem quãng đường đến khách sạn.</p>

          <form onSubmit={handleRouteSearch}>
            <div className="hotel-route-autocomplete">
              <label>
                <Search size={17} />
                <input
                  value={originQuery}
                  onFocus={() => setActiveOriginInput("sidebar")}
                  onChange={(event) =>
                    handleOriginQueryChange(event.target.value, "sidebar")
                  }
                  placeholder="Ví dụ: Chợ Bến Thành, Quận 1"
                  autoComplete="off"
                />
              </label>

              {activeOriginInput === "sidebar" ? (
                <OriginSuggestions
                  items={originSuggestions}
                  loading={suggestionsBusy}
                  query={originQuery}
                  onSelect={handleOriginSuggestionSelect}
                />
              ) : null}
            </div>

            <button type="submit" disabled={routeBusy}>
              <Navigation size={17} />
              {routeBusy ? "Đang tính..." : "Xem khoảng cách"}
            </button>
          </form>

          <button
            type="button"
            className="hotel-route-current-location"
            disabled={routeBusy}
            onClick={handleCurrentLocation}
          >
            <LocateFixed size={16} />
            Dùng vị trí hiện tại
          </button>

          {routeError ? (
            <div className="hotel-route-error">{routeError}</div>
          ) : null}

          {route && origin ? (
            <div className="hotel-route-result">
              <div>
                <Navigation size={19} />
                <span>
                  <small>Quãng đường lái xe</small>
                  <strong>{formatDistance(route.distance)}</strong>
                </span>
              </div>
              <div>
                <Clock3 size={19} />
                <span>
                  <small>Thời gian dự kiến</small>
                  <strong>{formatDuration(route.duration)}</strong>
                </span>
              </div>
              <p><b>Từ:</b> {origin.displayName}</p>
            </div>
          ) : null}
        </section>

        <small className="hotel-route-note">
          Khoảng cách và thời gian là ước tính theo tuyến đường hiện có.
        </small>
      </aside>

      <section className="hotel-route-map-stage">
        <form className="hotel-route-floating-search" onSubmit={handleRouteSearch}>
          <Search size={19} />
          <input
            value={originQuery}
            onFocus={() => setActiveOriginInput("floating")}
            onChange={(event) =>
              handleOriginQueryChange(event.target.value, "floating")
            }
            placeholder="Nhập nơi xuất phát để xem khoảng cách"
            autoComplete="off"
          />
          <button type="submit" disabled={routeBusy}>
            {routeBusy ? "Đang tính..." : "Xem đường"}
          </button>

          {activeOriginInput === "floating" ? (
            <OriginSuggestions
              items={originSuggestions}
              loading={suggestionsBusy}
              query={originQuery}
              onSelect={handleOriginSuggestionSelect}
            />
          ) : null}
        </form>

        <button
          type="button"
          className="hotel-route-map-close"
          onClick={onClose}
          aria-label="Đóng bản đồ"
        >
          Đóng
          <X size={22} />
        </button>

        <div ref={mapNodeRef} className="hotel-route-map-canvas" />

        {mapStatus === "loading" ? (
          <div className="hotel-route-map-status">Đang tải bản đồ...</div>
        ) : null}
        {mapStatus === "missing" ? (
          <div className="hotel-route-map-status">Khách sạn chưa cập nhật vị trí.</div>
        ) : null}
        {mapStatus === "error" ? (
          <div className="hotel-route-map-status">Không thể tải bản đồ lúc này.</div>
        ) : null}
      </section>
    </div>
  );
}
