import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadLeaflet } from "../../utils/openStreetMap";
import "./HotelLocationPicker.css";

const DEFAULT_CENTER = [10.7769, 106.7009];

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCoordinates(latitude, longitude) {
  return numberOrNull(latitude) !== null && numberOrNull(longitude) !== null;
}

function compact(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export default function HotelLocationPicker({
  address,
  ward,
  district,
  city,
  latitude,
  longitude,
  onChange,
  height = 360,
}) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState([]);

  const searchText = useMemo(
    () => [address, ward, district, city, "Việt Nam"].map(compact).filter(Boolean).join(", "),
    [address, ward, district, city],
  );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!mapNodeRef.current) return;
      const L = await loadLeaflet();
      if (cancelled || !mapNodeRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const lat = numberOrNull(latitude);
      const lng = numberOrNull(longitude);
      const initial = lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER;

      const map = L.map(mapNodeRef.current, {
        center: initial,
        zoom: lat !== null && lng !== null ? 16 : 12,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      function placeMarker(nextLat, nextLng, fly = false) {
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.marker([nextLat, nextLng], { draggable: true }).addTo(map);
        markerRef.current.on("dragend", (event) => {
          const point = event.target.getLatLng();
          onChange?.({ latitude: point.lat, longitude: point.lng });
        });
        if (fly) map.flyTo([nextLat, nextLng], 17, { animate: true, duration: 0.45 });
      }

      if (lat !== null && lng !== null) placeMarker(lat, lng);

      map.on("click", (event) => {
        const { lat: nextLat, lng: nextLng } = event.latlng;
        placeMarker(nextLat, nextLng);
        onChange?.({ latitude: nextLat, longitude: nextLng });
      });

      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
      setReady(true);
    }

    initialize().catch(() => {
      if (!cancelled) setSearchError("Không thể tải bản đồ chọn vị trí.");
    });

    return () => {
      cancelled = true;
      markerRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;
    const lat = numberOrNull(latitude);
    const lng = numberOrNull(longitude);
    if (lat === null || lng === null) return;

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = window.L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
    markerRef.current.on("dragend", (event) => {
      const point = event.target.getLatLng();
      onChange?.({ latitude: point.lat, longitude: point.lng });
    });
  }, [latitude, longitude, ready, onChange]);

  async function searchAddress() {
    if (!searchText) {
      setSearchError("Hãy nhập địa chỉ trước khi tìm.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setResults([]);

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: searchText,
        countrycodes: "vn",
        addressdetails: "1",
        limit: "6",
        "accept-language": "vi",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("SEARCH_FAILED");

      const data = await response.json();
      const parsed = (Array.isArray(data) ? data : [])
        .map((item) => ({
          id: `${item.osm_type ?? "osm"}-${item.osm_id ?? item.place_id}`,
          label: item.display_name,
          latitude: Number(item.lat),
          longitude: Number(item.lon),
        }))
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

      setResults(parsed);
      if (!parsed.length) {
        setSearchError("OpenStreetMap không tìm thấy kết quả chắc chắn. Bạn có thể tự zoom rồi bấm đúng vị trí trên bản đồ.");
      }
    } catch {
      setSearchError("Không thể tìm địa chỉ lúc này. Bạn vẫn có thể bấm trực tiếp đúng vị trí trên bản đồ.");
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(result) {
    onChange?.({ latitude: result.latitude, longitude: result.longitude });
    if (mapRef.current) mapRef.current.flyTo([result.latitude, result.longitude], 17, { animate: true, duration: 0.45 });
    setResults([]);
    setSearchError("");
  }

  function clearPosition() {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    onChange?.({ latitude: null, longitude: null });
  }

  const selected = hasCoordinates(latitude, longitude);

  return (
    <div className="hotel-location-picker">
      <div className="hotel-location-picker-toolbar">
        <div>
          <strong>Xác nhận vị trí chính xác</strong>
          <small>
            Tìm địa chỉ để xem các gợi ý, sau đó chọn đúng kết quả hoặc bấm trực tiếp lên bản đồ. Pin bạn chọn mới là vị trí được lưu.
          </small>
        </div>
        {selected ? (
          <button type="button" className="hotel-location-clear" onClick={clearPosition}>
            <X size={15} /> Xóa pin
          </button>
        ) : null}
      </div>

      <div className="hotel-location-search-row">
        <div className="hotel-location-query">
          <Search size={17} />
          <span>{searchText || "Chưa nhập địa chỉ"}</span>
        </div>
        <button type="button" className="catalog-secondary" onClick={searchAddress} disabled={searching}>
          <LocateFixed size={16} /> {searching ? "Đang tìm..." : "Tìm địa chỉ"}
        </button>
      </div>

      {results.length ? (
        <div className="hotel-location-results">
          {results.map((result) => (
            <button key={result.id} type="button" onClick={() => chooseResult(result)}>
              <MapPin size={16} />
              <span>{result.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {searchError ? <div className="hotel-location-warning">{searchError}</div> : null}

      <div ref={mapNodeRef} className="hotel-location-map" style={{ height }} />

      <div className={`hotel-location-selected ${selected ? "is-selected" : ""}`}>
        <MapPin size={17} />
        {selected ? (
          <span>
            Đã chọn: <b>{Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}</b>. Bạn có thể kéo pin để chỉnh chính xác hơn.
          </span>
        ) : (
          <span>Chưa chọn vị trí. Hãy bấm đúng chỗ khách sạn trên bản đồ.</span>
        )}
      </div>
    </div>
  );
}
