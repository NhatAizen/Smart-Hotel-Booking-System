let leafletPromise = null;

export function loadLeaflet() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Bản đồ chỉ có thể tải trong trình duyệt."));
  }

  if (window.L?.map) {
    return Promise.resolve(window.L);
  }

  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = Promise.all([import("leaflet"),import("leaflet/dist/leaflet.css")])
    .then(([module]) => { window.L=module.default ?? module; return window.L; })
    .catch(error => { leafletPromise=null; throw error; });

  return leafletPromise;
}

// The public OSM website/raster host may be unreachable on a user's network.
// OpenFreeMap serves OSM vector data; Leaflet continues to own markers/routes.
export async function addOsmBasemap(map, { onReady = () => {}, onError = () => {} } = {}) {
  const [gl, binding, worker] = await Promise.all([
    import("maplibre-gl"), import("@maplibre/maplibre-gl-leaflet"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"), import("maplibre-gl/dist/maplibre-gl.css"),
  ]);
  if(!map.getContainer()?.isConnected) return null;
  gl.setWorkerUrl(worker.default);
  const layer=binding.maplibreGL({style:"https://tiles.openfreemap.org/styles/liberty",interactive:false}).addTo(map);
  const vector=layer.getMaplibreMap();
  const timer=window.setTimeout(onError,15000);
  let ready=false;
  vector.once("load",()=>{ready=true;window.clearTimeout(timer);onReady();});
  vector.on("error",()=>{if(!ready) onError();});
  map.once("unload",()=>window.clearTimeout(timer));
  return layer;
}

export async function fetchDrivingRoute(origin,destination,signal) {
  for (const point of [origin,destination]) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180)
      throw new Error("Chưa có tọa độ hợp lệ của hai đầu tuyến đường.");
  }
  const coordinates=`${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,{signal:signal ?? AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error("Không thể tính tuyến đường lúc này. Bạn thử lại nhé.");
  const payload=await response.json();
  const route=payload?.routes?.[0];
  if(payload.code!=="Ok" || route?.geometry?.type!=="LineString" || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length<2
      || route.geometry.coordinates.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)
      || !Number.isFinite(route.distance) || route.distance<0 || !Number.isFinite(route.duration) || route.duration<0)
    throw new Error("Chưa xác nhận được tuyến đường giữa hai địa điểm.");
  return route;
}

export function buildHotelAddress(hotel) {
  return [
    hotel?.address,
    hotel?.ward,
    hotel?.district,
    hotel?.city,
    "Việt Nam",
  ]
    .filter(Boolean)
    .join(", ");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hotelStoredPosition(hotel) {
  const lat = numberOrNull(hotel?.latitude);
  const lng = numberOrNull(hotel?.longitude);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export async function resolveHotelPosition(hotel) {
  const stored = hotelStoredPosition(hotel);
  if (!stored) return null;

  return {
    ...stored,
    formattedAddress: buildHotelAddress(hotel),
    source: "stored",
  };
}
