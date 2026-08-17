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

function amenityLabel(amenity) {
  if (typeof amenity === "string") return amenity.trim();
  return String(amenity?.name ?? amenity?.label ?? "").trim();
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

const LOCAL_REGION_BOUNDARIES = {
  "quan 12": {
    type: "Feature",
    properties: { name: "Quận 12", display_name: "Quận 12, Thành phố Hồ Chí Minh", source: "bundled" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [106.693141924, 10.903837676],
        [106.694257893, 10.896556773],
        [106.688688556, 10.883631887],
        [106.691014295, 10.878346923],
        [106.700792662, 10.868320815],
        [106.713507073, 10.866043251],
        [106.717986085, 10.857664035],
        [106.714068844, 10.852039713],
        [106.704871291, 10.852012389],
        [106.698112524, 10.848599293],
        [106.697694417, 10.844759033],
        [106.702518118, 10.839263362],
        [106.699434557, 10.834676412],
        [106.69271351, 10.830356447],
        [106.688482925, 10.839383392],
        [106.687448344, 10.84761165],
        [106.678532019, 10.851319464],
        [106.674807268, 10.8577726],
        [106.670758845, 10.860153484],
        [106.661682172, 10.856180064],
        [106.653352124, 10.86078856],
        [106.646015305, 10.857045454],
        [106.638650873, 10.848204164],
        [106.632544902, 10.83372335],
        [106.627602431, 10.824614134],
        [106.619453399, 10.818621212],
        [106.608750148, 10.822459725],
        [106.603695019, 10.825468595],
        [106.60871149, 10.836959131],
        [106.614856297, 10.843187676],
        [106.6071107, 10.854309875],
        [106.613878093, 10.86591813],
        [106.620768067, 10.873821052],
        [106.627891824, 10.884226348],
        [106.632717226, 10.892382387],
        [106.641280442, 10.892172217],
        [106.648697214, 10.895174842],
        [106.653771717, 10.89227518],
        [106.662422824, 10.89354003],
        [106.669367423, 10.892235908],
        [106.670655882, 10.901203537],
        [106.679232082, 10.903294542],
        [106.683193235, 10.898741009],
        [106.692812496, 10.904692529],
        [106.693141924, 10.903837676]
      ]]
    }
  }
};

function getBundledRegionBoundary(regionName, cityName) {
  if (!isHoChiMinhCity(cityName)) return null;
  return LOCAL_REGION_BOUNDARIES[normalizeRegionLabel(regionName)] ?? null;
}
const HO_CHI_MINH_LEGACY_GIS_URL =
  "https://raw.githubusercontent.com/daohoangson/dvhcvn/master/data/gis/79.json";
let legacyHoChiMinhBoundaryPromise = null;
let regionBoundaryQueue = Promise.resolve();
let lastRegionBoundaryRequestAt = 0;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isHoChiMinhCity(value) {
  const normalized = normalizeText(value);
  return normalized.includes("ho chi minh") || normalized.includes("sai gon");
}

function normalizeRegionLabel(value) {
  return normalizeText(value)
    .replace(/^q\.?\s*(\d+)$/u, "quan $1")
    .replace(/^district\s+(\d+)$/u, "quan $1")
    .replace(/^quan\s+(\d+)$/u, "quan $1")
    .trim();
}

async function fetchLegacyHoChiMinhBoundary(regionName, cityName) {
  if (!isHoChiMinhCity(cityName)) return null;

  if (!legacyHoChiMinhBoundaryPromise) {
    legacyHoChiMinhBoundaryPromise = fetch(HO_CHI_MINH_LEGACY_GIS_URL, {
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Không tải được dữ liệu ranh giới TP.HCM.");
        return response.json();
      })
      .catch((error) => {
        legacyHoChiMinhBoundaryPromise = null;
        throw error;
      });
  }

  const data = await legacyHoChiMinhBoundaryPromise;
  const wanted = normalizeRegionLabel(regionName);
  const district = (data?.level2s ?? []).find(
    (item) => normalizeRegionLabel(item?.name) === wanted,
  );

  if (!district?.coordinates || !district?.type) return null;

  return {
    type: "Feature",
    properties: {
      name: district.name,
      display_name: `${district.name}, Thành phố Hồ Chí Minh`,
      source: "dvhcvn",
    },
    geometry: {
      type: district.type,
      coordinates: district.coordinates,
    },
  };
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

  // Khu vực đã đóng gói trong frontend phải được dùng trước mọi request mạng.
  // Nhờ vậy Quận 12 vẫn tô màu ngay cả khi raw GitHub/Nominatim bị chặn,
  // chậm hoặc giới hạn request trong trình duyệt.
  const bundledFeature = getBundledRegionBoundary(regionName, cityName);
  if (bundledFeature) {
    REGION_BOUNDARY_CACHE.set(cacheKey, bundledFeature);
    return bundledFeature;
  }

  const request = regionBoundaryQueue.then(async () => {
    // TP.HCM dùng bộ ranh giới quận/huyện tĩnh trước để tránh Nominatim
    // thay đổi dữ liệu hành chính hoặc giới hạn request làm vùng tô màu lúc có lúc không.
    try {
      const legacyFeature = await fetchLegacyHoChiMinhBoundary(regionName, cityName);
      if (legacyFeature) {
        REGION_BOUNDARY_CACHE.set(cacheKey, legacyFeature);
        return legacyFeature;
      }
    } catch {
      // Nếu nguồn tĩnh không tải được thì vẫn còn Nominatim làm fallback.
    }

    const queryVariants = [
      `${regionName}, ${cityName || "Hồ Chí Minh"}, Việt Nam`,
      `${regionName}, Thành phố Hồ Chí Minh, Việt Nam`,
      `${String(regionName).replace(/^Quận\s*/iu, "District ")}, Ho Chi Minh City, Vietnam`,
    ];

    for (const query of [...new Set(queryVariants)]) {
      const elapsed = Date.now() - lastRegionBoundaryRequestAt;
      if (elapsed < 1100) await wait(1100 - elapsed);

      const params = new URLSearchParams({
        q: query,
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

      if (!response.ok) continue;

      const data = await response.json();
      const candidates = (data?.features ?? [])
        .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
        .sort((a, b) => regionBoundaryScore(b, regionName, cityName) - regionBoundaryScore(a, regionName, cityName));

      const best = candidates[0] ?? null;
      if (best) {
        REGION_BOUNDARY_CACHE.set(cacheKey, best);
        return best;
      }
    }

    REGION_BOUNDARY_CACHE.set(cacheKey, null);
    return null;
  });

  regionBoundaryQueue = request.catch(() => null);
  return request;
}

function MapCanvas({
  hotels,
  reviewSummaries,
  selectedHotelId,
  hoveredHotelId,
  visibleHotelIds,
  selectedRegions,
  regionCity,
  onSelectHotel,
  onHoverHotel,
  onOpenHotel,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef(new Map());
  const locationByHotelRef = useRef(new Map());
  const selectedHotelIdRef = useRef(selectedHotelId);
  const hoveredHotelIdRef = useRef(hoveredHotelId);
  const visibleHotelIdsRef = useRef(visibleHotelIds);
  const regionLayerGroupRef = useRef(null);
  const regionRendererRef = useRef(null);
  const regionRequestRef = useRef(0);
  const onSelectHotelRef = useRef(onSelectHotel);
  const onHoverHotelRef = useRef(onHoverHotel);
  const onOpenHotelRef = useRef(onOpenHotel);
  const hotelsRef = useRef(hotels);
  const reviewSummariesRef = useRef(reviewSummaries);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Đang tải bản đồ OpenStreetMap...");
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const [mapReadyTick, setMapReadyTick] = useState(0);

  useEffect(() => {
    selectedHotelIdRef.current = selectedHotelId;
  }, [selectedHotelId]);

  useEffect(() => {
    hoveredHotelIdRef.current = hoveredHotelId;
  }, [hoveredHotelId]);

  useEffect(() => {
    visibleHotelIdsRef.current = visibleHotelIds;
  }, [visibleHotelIds]);

  useEffect(() => {
    onSelectHotelRef.current = onSelectHotel;
  }, [onSelectHotel]);

  useEffect(() => {
    onHoverHotelRef.current = onHoverHotel;
  }, [onHoverHotel]);

  useEffect(() => {
    onOpenHotelRef.current = onOpenHotel;
  }, [onOpenHotel]);

  useEffect(() => {
    hotelsRef.current = hotels;
  }, [hotels]);

  useEffect(() => {
    reviewSummariesRef.current = reviewSummaries;
  }, [reviewSummaries]);

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
        const currentHotels = hotelsRef.current ?? [];
        const currentReviewSummaries = reviewSummariesRef.current ?? {};
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

        // Dedicated pane for administrative boundaries.
        // Using an explicit SVG renderer avoids the invisible polygon issue that can
        // happen when the map prefers Canvas for vector layers.
        let regionPane = map.getPane("enziuRegionPane");
        if (!regionPane) {
          regionPane = map.createPane("enziuRegionPane");
        }
        regionPane.style.zIndex = "550";
        regionPane.style.pointerEvents = "none";

        const regionRenderer = L.svg({
          pane: "enziuRegionPane",
          padding: 0.5,
        }).addTo(map);

        regionRendererRef.current = regionRenderer;
        regionLayerGroupRef.current = L.layerGroup().addTo(map);
        const bounds = L.latLngBounds([]);
        let mappedCount = 0;

        for (let index = 0; index < currentHotels.slice(0, 60).length; index += 1) {
          const hotel = currentHotels[index];
          if (cancelled) return;

          setMessage(`Đang đặt khách sạn ${index + 1}/${Math.min(currentHotels.length, 60)} lên bản đồ...`);

          let position = null;
          try {
            position = await resolveHotelPosition(hotel);
          } catch {
            position = null;
          }

          if (!position || cancelled) continue;

          const marker = L.marker([position.lat, position.lng], {
            icon: createMarkerIcon(
              L,
              String(hotel.id) === String(selectedHotelIdRef.current)
                || String(hotel.id) === String(hoveredHotelIdRef.current),
            ),
            title: hotel.name,
            riseOnHover: true,
          }).addTo(map);

          marker.bindPopup(
            createInfoContent(hotel, currentReviewSummaries[hotel.id], (hotelId) => onOpenHotelRef.current?.(hotelId)),
            {
              maxWidth: 380,
              minWidth: 300,
              className: "enziu-map-popup",
              closeButton: false,
              autoPan: false,
            },
          );

          marker.on("mouseover", () => {
            onHoverHotelRef.current?.(hotel.id);
            marker.openPopup();
          });

          marker.on("mouseout", () => {
            if (String(selectedHotelIdRef.current) !== String(hotel.id)) {
              onHoverHotelRef.current?.(null);
              marker.closePopup();
            }
          });

          marker.on("click", () => {
            onSelectHotelRef.current?.(hotel.id);
            onHoverHotelRef.current?.(null);
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
            mappedCount < currentHotels.length
              ? `${mappedCount}/${currentHotels.length} khách sạn có vị trí hợp lệ trên bản đồ.`
              : "",
          );
        } else {
          setMapReadyTick((current) => current + 1);
          setStatus("empty");
          setMessage("Hiện chưa có vị trí bản đồ phù hợp cho các khách sạn trong danh sách.");
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
      regionRendererRef.current = null;
      leafletRef.current = null;
    };
  }, [hotelSignature]);

  useEffect(() => {
    const visibleIds = new Set((visibleHotelIds ?? []).map(String));

    markersRef.current.forEach((marker, id) => {
      const visible = visibleIds.has(String(id));
      marker.setOpacity(visible ? 1 : 0);
      const element = marker.getElement();
      if (element) element.style.pointerEvents = visible ? "" : "none";
    });

    if (selectedHotelId && !visibleIds.has(String(selectedHotelId))) {
      mapRef.current?.closePopup();
    }
  }, [selectedHotelId, visibleHotelIds]);

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

          const regionStyle = {
            color: "#e7a400",
            weight: 4,
            opacity: 0.85,
            fillColor: "#ffd54a",
            fillOpacity: 0.16,
          };

          // Với ranh giới đóng gói sẵn, vẽ trực tiếp bằng Leaflet polygon
          // để không phụ thuộc vào cách Leaflet parse GeoJSON/MultiPolygon.
          // Nguồn online vẫn dùng L.geoJSON như cũ.
          let layer;
          if (feature?.properties?.source === "bundled" && feature?.geometry?.type === "Polygon") {
            const latLngs = (feature.geometry.coordinates?.[0] ?? [])
              .map(([lng, lat]) => [lat, lng]);
            const renderer = regionRendererRef.current ?? undefined;

            layer = L.polygon(latLngs, {
              ...regionStyle,
              pane: "enziuRegionPane",
              renderer,
              className: "enziu-region-boundary-path",
              interactive: false,
              bubblingMouseEvents: false,
            }).addTo(group);

            // Draw the border once more as a polyline. This is intentional:
            // even if a browser fails to paint the polygon fill, the yellow
            // administrative outline remains visible.
            L.polyline(latLngs, {
              pane: "enziuRegionPane",
              renderer,
              className: "enziu-region-boundary-outline",
              color: "#e5ad24",
              weight: 3,
              opacity: 1,
              interactive: false,
              bubblingMouseEvents: false,
            }).addTo(group);
          } else {
            layer = L.geoJSON(feature, {
              pane: "enziuRegionPane",
              renderer: regionRendererRef.current ?? undefined,
              interactive: false,
              style: () => ({
                ...regionStyle,
                pane: "enziuRegionPane",
                renderer: regionRendererRef.current ?? undefined,
                className: "enziu-region-boundary-path",
              }),
            }).addTo(group);
          }

          if (layer.bringToFront) layer.bringToFront();
          const layerBounds = layer.getBounds();
          if (layerBounds.isValid()) regionBounds.extend(layerBounds);
          rendered += 1;
        } catch {
          // Keep the map usable even if one public-boundary lookup fails.
        }
      }

      if (cancelled || regionRequestRef.current !== requestId) return;

      if (rendered > 0 && regionBounds.isValid()) {
        setBoundaryMessage(
          selectedRegions.length === 1
            ? `Đang hiển thị ranh giới ${selectedRegions[0]}.`
            : `Đang hiển thị ${rendered} khu vực đã chọn.`,
        );
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
      const active = String(id) === String(selectedHotelId)
        || String(id) === String(hoveredHotelId);
      marker.setIcon(createMarkerIcon(L, active));
    });

    if (!selectedHotelId) return;

    const marker = markersRef.current.get(String(selectedHotelId));
    const location = locationByHotelRef.current.get(String(selectedHotelId));
    if (!marker || !location) return;

    const target = L.latLng(location.lat, location.lng);
    const distance = map.getCenter().distanceTo(target);
    const needsMove = distance > 120 || map.getZoom() < SELECTED_HOTEL_ZOOM - 1;

    if (needsMove) {
      map.flyTo(target, SELECTED_HOTEL_ZOOM, {
        animate: true,
        duration: 0.38,
      });
    }
    marker.openPopup();
  }, [hoveredHotelId, selectedHotelId]);

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
  const [hoveredHotelId, setHoveredHotelId] = useState(null);
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

  const amenityOptions = useMemo(() => {
    const values = new Map();

    allHotels.forEach((hotel) => {
      (Array.isArray(hotel?.amenities) ? hotel.amenities : []).forEach((amenity) => {
        const label = amenityLabel(amenity);
        const id = normalizeText(label);
        if (!id) return;

        const current = values.get(id);
        values.set(id, {
          id,
          label: current?.label ?? label,
          count: (current?.count ?? 0) + 1,
        });
      });
    });

    return [...values.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "vi"),
    );
  }, [allHotels]);

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

  const visibleHotelIds = useMemo(
    () => mapHotels.map((hotel) => String(hotel.id)),
    [mapHotels],
  );

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
    setHoveredHotelId(null);
    setSelectedRegions((current) =>
      current.includes(regionName)
        ? current.filter((region) => region !== regionName)
        : [...current, regionName],
    );
  }

  function toggleAmenity(amenityId) {
    setSelectedHotelId(null);
    setHoveredHotelId(null);
    setFilters((current) => ({
      ...current,
      amenities: (current.amenities ?? []).includes(amenityId)
        ? current.amenities.filter((item) => item !== amenityId)
        : [...(current.amenities ?? []), amenityId],
    }));
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
              setHoveredHotelId(null);
              setFilters({ stars: [], amenities: [], sort: "recommended" });
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

        {amenityOptions.length ? (
          <div className="customer-map-filter-group">
            <h3>Tiện nghi khách sạn</h3>
            {amenityOptions.map((amenity) => (
              <label className="customer-map-check-row" key={amenity.id}>
                <input
                  type="checkbox"
                  checked={(filters.amenities ?? []).includes(amenity.id)}
                  onChange={() => toggleAmenity(amenity.id)}
                />
                <span>{amenity.label}</span>
                <small>{amenity.count}</small>
              </label>
            ))}
          </div>
        ) : null}
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
            const selected = String(hotel.id) === String(selectedHotelId)
              || String(hotel.id) === String(hoveredHotelId);
            const favorite = favoriteIds.has(hotel.id);

            return (
              <article
                key={hotel.id}
                className={`customer-map-hotel-card ${selected ? "selected" : ""}`}
                onMouseEnter={() => setHoveredHotelId(hotel.id)}
                onMouseLeave={() => setHoveredHotelId(null)}
                onClick={() => {
                  setHoveredHotelId(null);
                  setSelectedHotelId(hotel.id);
                }}
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
                setHoveredHotelId(null);
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
          hotels={hotels}
          reviewSummaries={reviewSummaries}
          selectedHotelId={selectedHotelId}
          hoveredHotelId={hoveredHotelId}
          visibleHotelIds={visibleHotelIds}
          selectedRegions={selectedRegions}
          regionCity={regionCity}
          onSelectHotel={setSelectedHotelId}
          onHoverHotel={setHoveredHotelId}
          onOpenHotel={onOpenHotel}
        />
      </section>
    </div>
  );
}
