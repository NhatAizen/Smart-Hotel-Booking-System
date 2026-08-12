import {
  Heart,
  MapPin,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildHotelAddress,
  loadLeaflet,
  resolveHotelPosition,
} from "../../utils/openStreetMap";

import "./HotelMapOverlay.css";

function hotelCover(hotel) {
  return hotel.coverImageUrl
    ?? hotel.imageUrl
    ?? hotel.images?.find((image) => image.cover || image.isCover)?.imageUrl
    ?? hotel.images?.find((image) => image.cover || image.isCover)?.url
    ?? "/hotel-placeholder.svg";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ratingLabel(summary) {
  if (summary?.averageRating == null) return "Chưa có đánh giá";
  const rating = Number(summary.averageRating);
  if (rating >= 9) return "Tuyệt hảo";
  if (rating >= 8) return "Rất tốt";
  if (rating >= 7) return "Tốt";
  return "Khá tốt";
}

function compactAddress(hotel) {
  return [hotel.address, hotel.ward, hotel.district, hotel.city]
    .filter(Boolean)
    .join(", ");
}

function hotelRegionName(hotel) {
  const explicitDistrict = String(hotel.district ?? "").trim();
  if (explicitDistrict) return explicitDistrict;

  const addressText = [hotel.address, hotel.ward, hotel.city]
    .filter(Boolean)
    .join(", ");

  const districtMatch = addressText.match(/Quận\s*([^,]+)/iu);
  if (districtMatch?.[1]) return `Quận ${districtMatch[1].trim()}`;

  const thuDucText = normalizeText(addressText);
  if (thuDucText.includes("thu duc")) return "Thành phố Thủ Đức";

  const huyệnMatch = addressText.match(/Huyện\s*([^,]+)/iu);
  if (huyệnMatch?.[1]) return `Huyện ${huyệnMatch[1].trim()}`;

  return "";
}

function createInfoContent(hotel, summary, onOpenHotel) {
  const root = document.createElement("div");
  root.className = "enziu-map-info-window";

  const image = document.createElement("img");
  image.src = hotelCover(hotel);
  image.alt = hotel.name;
  root.appendChild(image);

  const body = document.createElement("div");
  body.className = "enziu-map-info-body";

  const title = document.createElement("strong");
  title.textContent = hotel.name;
  body.appendChild(title);

  const stars = document.createElement("div");
  stars.className = "enziu-map-info-stars";
  stars.textContent = `${"★".repeat(Number(hotel.starRating ?? 0))}${hotel.starRating ? `  ${hotel.starRating} sao` : ""}`;
  body.appendChild(stars);

  const address = document.createElement("small");
  address.textContent = compactAddress(hotel);
  body.appendChild(address);

  if (summary?.averageRating != null) {
    const rating = document.createElement("div");
    rating.className = "enziu-map-info-rating";
    rating.textContent = `${Number(summary.averageRating).toFixed(1)} · ${ratingLabel(summary)}`;
    body.appendChild(rating);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Xem phòng";
  button.addEventListener("click", () => onOpenHotel(hotel.id));
  body.appendChild(button);

  root.appendChild(body);
  return root;
}

function createMarkerIcon(L, selected = false) {
  return L.divIcon({
    className: "enziu-osm-marker-shell",
    html: `<div class="enziu-osm-marker${selected ? " selected" : ""}"><span></span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -37],
  });
}

const SINGLE_HOTEL_ZOOM = 16;
const SELECTED_HOTEL_ZOOM = 16;

const REGION_BOUNDARY_CACHE = new Map();
let regionBoundaryQueue = Promise.resolve();
let lastRegionBoundaryRequestAt = 0;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function regionBoundaryScore(feature, regionName, cityName) {
  const displayName = normalizeText(feature?.properties?.display_name);
  const region = normalizeText(regionName);
  const city = normalizeText(cityName);

  let score = 0;
  if (displayName.includes(region)) score += 10;
  if (city && displayName.includes(city)) score += 5;
  if (feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon") score += 8;
  if (feature?.properties?.type === "administrative" || feature?.properties?.addresstype === "administrative") score += 4;
  return score;
}

async function fetchRegionBoundary(regionName, cityName) {
  const cacheKey = `${normalizeText(regionName)}|${normalizeText(cityName)}`;
  if (REGION_BOUNDARY_CACHE.has(cacheKey)) return REGION_BOUNDARY_CACHE.get(cacheKey);

  const request = regionBoundaryQueue.then(async () => {
    const elapsed = Date.now() - lastRegionBoundaryRequestAt;
    if (elapsed < 1100) await wait(1100 - elapsed);

    const params = new URLSearchParams({
      q: `${regionName}, ${cityName || "Hồ Chí Minh"}, Việt Nam`,
      format: "geojson",
      polygon_geojson: "1",
      addressdetails: "1",
      limit: "8",
      countrycodes: "vn",
      "accept-language": "vi",
    });

    lastRegionBoundaryRequestAt = Date.now();
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/geo+json, application/json" },
    });

    if (!response.ok) throw new Error(`Không lấy được ranh giới ${regionName}.`);

    const data = await response.json();
    const candidates = (data?.features ?? [])
      .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
      .sort((a, b) => regionBoundaryScore(b, regionName, cityName) - regionBoundaryScore(a, regionName, cityName));

    const best = candidates[0] ?? null;
    REGION_BOUNDARY_CACHE.set(cacheKey, best);
    return best;
  });

  regionBoundaryQueue = request.catch(() => null);
  return request;
}

function MapCanvas({ hotels, reviewSummaries, selectedHotelId, selectedRegions, regionCity, onSelectHotel, onOpenHotel }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef(new Map());
  const locationByHotelRef = useRef(new Map());
  const selectedHotelIdRef = useRef(selectedHotelId);
  const regionLayerGroupRef = useRef(null);
  const regionRequestRef = useRef(0);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Đang tải bản đồ OpenStreetMap...");
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const [mapReadyTick, setMapReadyTick] = useState(0);

  useEffect(() => {
    selectedHotelIdRef.current = selectedHotelId;
  }, [selectedHotelId]);

  const hotelSignature = useMemo(
    () => hotels
      .map((hotel) => [hotel.id, hotel.latitude, hotel.longitude, buildHotelAddress(hotel)].join("|"))
      .join("::"),
    [hotels],
  );

  useEffect(() => {
    let cancelled = false;
    const markerStore = markersRef.current;
    const locationStore = locationByHotelRef.current;

    async function initialize() {
      if (!containerRef.current) return;

      setStatus("loading");
      setMessage("Đang tải bản đồ OpenStreetMap...");

      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        leafletRef.current = L;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        markerStore.clear();
        locationStore.clear();

        const map = L.map(containerRef.current, {
          center: [16.0471, 108.2062],
          zoom: 6,
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        mapRef.current = map;
        regionLayerGroupRef.current = L.layerGroup().addTo(map);
        const bounds = L.latLngBounds([]);
        let mappedCount = 0;

        for (let index = 0; index < hotels.slice(0, 60).length; index += 1) {
          const hotel = hotels[index];
          if (cancelled) return;

          setMessage(`Đang đặt khách sạn ${index + 1}/${Math.min(hotels.length, 60)} lên bản đồ...`);

          let position = null;
          try {
            position = await resolveHotelPosition(hotel);
          } catch {
            position = null;
          }

          if (!position || cancelled) continue;

          const marker = L.marker([position.lat, position.lng], {
            icon: createMarkerIcon(L, String(hotel.id) === String(selectedHotelIdRef.current)),
            title: hotel.name,
            riseOnHover: true,
          }).addTo(map);

          marker.bindPopup(
            createInfoContent(hotel, reviewSummaries[hotel.id], onOpenHotel),
            {
              maxWidth: 380,
              minWidth: 300,
              className: "enziu-map-popup",
              closeButton: false,
              autoPanPaddingTopLeft: [18, 72],
              autoPanPaddingBottomRight: [18, 18],
            },
          );

          marker.on("mouseover", () => {
            onSelectHotel(hotel.id);
            marker.openPopup();
          });

          marker.on("click", () => {
            onSelectHotel(hotel.id);
            marker.openPopup();
          });

          markerStore.set(String(hotel.id), marker);
          locationStore.set(String(hotel.id), {
            lat: position.lat,
            lng: position.lng,
          });
          bounds.extend([position.lat, position.lng]);
          mappedCount += 1;
        }

        if (cancelled) return;

        if (mappedCount > 0) {
          if (mappedCount === 1) {
            map.setView(bounds.getCenter(), SINGLE_HOTEL_ZOOM);
          } else {
            map.fitBounds(bounds, {
              paddingTopLeft: [40, 80],
              paddingBottomRight: [40, 40],
              maxZoom: 15,
            });
          }

          window.setTimeout(() => map.invalidateSize(), 0);
          setStatus("ready");
          setMapReadyTick((current) => current + 1);
          setMessage(
            mappedCount < hotels.length
              ? `${mappedCount}/${hotels.length} khách sạn có vị trí hợp lệ trên bản đồ.`
              : "",
          );
        } else {
          setMapReadyTick((current) => current + 1);
          setStatus("empty");
          setMessage("Các khách sạn hiện tại chưa có tọa độ trong hệ thống. Hãy rebuild hotel-service để hệ thống tự backfill tọa độ từ địa chỉ.");
        }
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error?.message ?? "Không thể tải OpenStreetMap.");
      }
    }

    initialize();

    return () => {
      cancelled = true;
      markerStore.clear();
      locationStore.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      regionLayerGroupRef.current = null;
      leafletRef.current = null;
    };
  }, [hotelSignature, hotels, reviewSummaries, onOpenHotel, onSelectHotel]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return undefined;

    const requestId = regionRequestRef.current + 1;
    regionRequestRef.current = requestId;
    let cancelled = false;

    let group = regionLayerGroupRef.current;
    if (!group) {
      group = L.layerGroup().addTo(map);
      regionLayerGroupRef.current = group;
    }
    group.clearLayers();
    setBoundaryMessage("");

    if (!selectedRegions.length) return undefined;

    async function drawSelectedRegions() {
      const regionBounds = L.latLngBounds([]);
      let rendered = 0;

      for (const regionName of selectedRegions) {
        if (cancelled || regionRequestRef.current !== requestId) return;

        try {
          const feature = await fetchRegionBoundary(regionName, regionCity);
          if (!feature || cancelled || regionRequestRef.current !== requestId) continue;

          const layer = L.geoJSON(feature, {
            interactive: false,
            style: {
              color: "#f3ad00",
              weight: 3,
              opacity: 0.95,
              fillColor: "#ffd54a",
              fillOpacity: 0.22,
            },
          }).addTo(group);

          const layerBounds = layer.getBounds();
          if (layerBounds.isValid()) regionBounds.extend(layerBounds);
          rendered += 1;
        } catch {
          // Keep the map usable even if one public-boundary lookup fails.
        }
      }

      if (cancelled || regionRequestRef.current !== requestId) return;

      if (rendered > 0 && regionBounds.isValid()) {
        map.fitBounds(regionBounds, {
          paddingTopLeft: [42, 88],
          paddingBottomRight: [42, 42],
          maxZoom: 13,
        });
      }

      if (rendered < selectedRegions.length) {
        setBoundaryMessage(
          rendered === 0
            ? "Chưa lấy được ranh giới khu vực đã chọn."
            : `${rendered}/${selectedRegions.length} khu vực đã hiển thị ranh giới.`,
        );
      }
    }

    drawSelectedRegions();

    return () => {
      cancelled = true;
    };
  }, [mapReadyTick, regionCity, selectedRegions]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    markersRef.current.forEach((marker, id) => {
      marker.setIcon(createMarkerIcon(L, String(id) === String(selectedHotelId)));
    });

    if (!selectedHotelId) {
      map.closePopup();
      return;
    }

    const marker = markersRef.current.get(String(selectedHotelId));
    const location = locationByHotelRef.current.get(String(selectedHotelId));
    if (!marker || !location) return;

    map.flyTo([location.lat, location.lng], SELECTED_HOTEL_ZOOM, {
      animate: true,
      duration: 0.55,
    });
    marker.openPopup();
  }, [selectedHotelId]);

  return (
    <div className="customer-google-map-canvas-wrap">
      <div ref={containerRef} className="customer-google-map-canvas" />

      {status !== "ready" || message ? (
        <div className={`customer-map-status customer-map-status-${status}`}>
          <span>{message}</span>
        </div>
      ) : null}

      {boundaryMessage ? (
        <div className="customer-region-boundary-status">{boundaryMessage}</div>
      ) : null}
    </div>
  );
}

export default function HotelMapOverlay({
  hotels,
  allHotels,
  reviewSummaries,
  favoriteIds,
  favoriteBusyId,
  filters,
  setFilters,
  onToggleStar,
  onToggleFavorite,
  onOpenHotel,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [selectedRegions, setSelectedRegions] = useState([]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const regionOptions = useMemo(() => {
    const counts = new Map();

    allHotels.forEach((hotel) => {
      const label = hotelRegionName(hotel);
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [allHotels]);

  const regionCity = useMemo(
    () => allHotels.find((hotel) => hotel.city)?.city ?? "Hồ Chí Minh",
    [allHotels],
  );

  const mapHotels = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return hotels.filter((hotel) => {
      const queryMatch = !normalizedQuery
        || normalizeText([hotel.name, hotel.address, hotel.ward, hotel.district, hotel.city].join(" "))
          .includes(normalizedQuery);

      const hotelRegion = hotelRegionName(hotel);
      const regionMatch = selectedRegions.length === 0
        || selectedRegions.some((region) => normalizeText(hotelRegion) === normalizeText(region));

      return queryMatch && regionMatch;
    });
  }, [hotels, query, selectedRegions]);

  useEffect(() => {
    if (!mapHotels.length) {
      setSelectedHotelId(null);
      return;
    }

    if (selectedHotelId && !mapHotels.some((hotel) => String(hotel.id) === String(selectedHotelId))) {
      setSelectedHotelId(null);
    }
  }, [mapHotels, selectedHotelId]);

  function toggleRegion(regionName) {
    setSelectedHotelId(null);
    setSelectedRegions((current) =>
      current.includes(regionName)
        ? current.filter((region) => region !== regionName)
        : [...current, regionName],
    );
  }

  return (
    <div className="customer-google-map-overlay" role="dialog" aria-modal="true" aria-label="Bản đồ khách sạn">
      <div className="customer-map-filter-pane">
        <div className="customer-map-filter-heading">
          <strong>Chọn lọc theo:</strong>
          <button
            type="button"
            onClick={() => {
              setSelectedRegions([]);
              setSelectedHotelId(null);
              setFilters({ stars: [], maxPrice: 10000000, sort: "recommended" });
            }}
          >
            Xóa tất cả
          </button>
        </div>

        {regionOptions.length ? (
          <div className="customer-map-filter-group customer-map-region-group">
            <h3>Khu vực</h3>
            <div className="customer-map-region-list">
              {regionOptions.map((region) => (
                <label key={region.name} className="customer-map-check-row">
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(region.name)}
                    onChange={() => toggleRegion(region.name)}
                  />
                  <span>{region.name}</span>
                  <small>{region.count}</small>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="customer-map-filter-group">
          <h3>Khoảng giá / đêm</h3>
          <input
            type="range"
            min="0"
            max="10000000"
            step="100000"
            value={filters.maxPrice}
            onChange={(event) => setFilters((current) => ({ ...current, maxPrice: Number(event.target.value) }))}
          />
          <div className="customer-map-price-row">
            <span>0đ</span>
            <span>{filters.maxPrice.toLocaleString("vi-VN")}đ</span>
          </div>
        </div>

        <div className="customer-map-filter-group">
          <h3>Xếp hạng sao</h3>
          {[5, 4, 3, 2, 1].map((star) => (
            <label key={star} className="customer-map-check-row">
              <input
                type="checkbox"
                checked={filters.stars.includes(star)}
                onChange={() => onToggleStar(star)}
              />
              <span>{star} sao</span>
              <small>{allHotels.filter((hotel) => Number(hotel.starRating) === star).length}</small>
            </label>
          ))}
        </div>

        <div className="customer-map-filter-group">
          <h3>Tiện nghi cơ bản</h3>
          <label className="customer-map-check-row"><input type="checkbox" /><span>Wifi miễn phí</span></label>
          <label className="customer-map-check-row"><input type="checkbox" /><span>Điều hòa</span></label>
          <label className="customer-map-check-row"><input type="checkbox" /><span>Bãi đỗ xe</span></label>
        </div>
      </div>

      <section className="customer-map-list-pane">
        <div className="customer-map-list-head">
          <div>
            <strong>{hotels.length} khách sạn</strong>
            <small>Chọn khách sạn để định vị trên bản đồ</small>
          </div>
          <select
            value={filters.sort}
            onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}
          >
            <option value="recommended">Lựa chọn hàng đầu</option>
            <option value="stars-desc">Số sao cao nhất</option>
            <option value="name-asc">Tên A–Z</option>
          </select>
        </div>

        <div className="customer-map-list-scroll">
          {mapHotels.length ? mapHotels.map((hotel) => {
            const summary = reviewSummaries[hotel.id];
            const selected = String(hotel.id) === String(selectedHotelId);
            const favorite = favoriteIds.has(hotel.id);

            return (
              <article
                key={hotel.id}
                className={`customer-map-hotel-card ${selected ? "selected" : ""}`}
                onMouseEnter={() => setSelectedHotelId(hotel.id)}
                onClick={() => setSelectedHotelId(hotel.id)}
              >
                <div className="customer-map-hotel-image-wrap">
                  <img src={hotelCover(hotel)} alt={hotel.name} />
                  <button
                    type="button"
                    className={`customer-map-favorite ${favorite ? "active" : ""}`}
                    aria-label={favorite ? "Bỏ khỏi yêu thích" : "Thêm vào yêu thích"}
                    disabled={favoriteBusyId === hotel.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(hotel.id);
                    }}
                  >
                    <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                  </button>
                </div>

                <div className="customer-map-hotel-copy">
                  <button
                    type="button"
                    className="customer-map-hotel-name"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenHotel(hotel.id);
                    }}
                  >
                    {hotel.name}
                  </button>

                  <div className="customer-map-stars">
                    {Array.from({ length: Number(hotel.starRating ?? 0) }).map((_, index) => (
                      <Star key={index} size={12} fill="currentColor" />
                    ))}
                  </div>

                  <div className="customer-map-address">
                    <MapPin size={13} />
                    <span>{compactAddress(hotel)}</span>
                  </div>

                  <div className="customer-map-rating-row">
                    {summary?.averageRating != null ? (
                      <><b>{Number(summary.averageRating).toFixed(1)}</b><span>{ratingLabel(summary)}</span></>
                    ) : (
                      <span>Chưa có đánh giá</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="customer-map-open-hotel"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenHotel(hotel.id);
                    }}
                  >
                    Xem phòng
                  </button>
                </div>
              </article>
            );
          }) : (
            <div className="customer-map-list-empty">Không có khách sạn phù hợp với từ khóa.</div>
          )}
        </div>
      </section>

      <section className="customer-map-canvas-pane">
        <div className="customer-map-toolbar">
          <label className="customer-map-search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm khách sạn trên bản đồ"
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={16} /></button> : null}
          </label>

          {selectedRegions.length ? (
            <button
              type="button"
              className="customer-map-region-chip"
              onClick={() => {
                setSelectedRegions([]);
                setSelectedHotelId(null);
              }}
              title="Bỏ lọc khu vực"
            >
              Khu vực <b>{selectedRegions.length}</b> <X size={14} />
            </button>
          ) : null}

          <button type="button" className="customer-map-close" onClick={onClose}>
            Đóng bản đồ <X size={18} />
          </button>
        </div>

        <MapCanvas
          hotels={mapHotels}
          reviewSummaries={reviewSummaries}
          selectedHotelId={selectedHotelId}
          selectedRegions={selectedRegions}
          regionCity={regionCity}
          onSelectHotel={setSelectedHotelId}
          onOpenHotel={onOpenHotel}
        />
      </section>
    </div>
  );
}
