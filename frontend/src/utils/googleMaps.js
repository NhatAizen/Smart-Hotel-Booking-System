let googleMapsPromise = null;
const geocodeCache = new Map();

export function hasGoogleMapsApiKey() {
  return Boolean(String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim());
}

export function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps chỉ có thể tải trong trình duyệt."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();

  if (!apiKey) {
    return Promise.reject(
      new Error("Chưa cấu hình VITE_GOOGLE_MAPS_API_KEY trong file .env của frontend."),
    );
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-enziu-google-maps="true"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Không thể tải Google Maps JavaScript API.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    const callbackName = "__enziuGoogleMapsReady";

    script.dataset.enziuGoogleMaps = "true";
    script.async = true;
    script.defer = true;

    window[callbackName] = () => {
      delete window[callbackName];
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        googleMapsPromise = null;
        reject(new Error("Google Maps đã tải nhưng không khởi tạo được."));
      }
    };

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker&language=vi&region=VN&v=weekly&loading=async&callback=${callbackName}`;

    script.addEventListener("error", () => {
      delete window[callbackName];
      googleMapsPromise = null;
      reject(new Error("Không thể tải Google Maps JavaScript API."));
    });

    document.head.appendChild(script);
  });

  return googleMapsPromise;
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

function hotelStoredPosition(hotel) {
  const lat = numberOrNull(hotel?.latitude);
  const lng = numberOrNull(hotel?.longitude);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export async function geocodePlaceId(placeId) {
  const normalized = String(placeId ?? "").trim();
  if (!normalized) return null;

  const cacheKey = `place:${normalized}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const maps = await loadGoogleMaps();
  const geocoder = new maps.Geocoder();

  const promise = new Promise((resolve, reject) => {
    geocoder.geocode(
      { placeId: normalized },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          resolve({
            lat: location.lat(),
            lng: location.lng(),
            formattedAddress: results[0].formatted_address ?? "",
            placeId: results[0].place_id ?? normalized,
          });
          return;
        }

        if (status === "ZERO_RESULTS") {
          resolve(null);
          return;
        }

        reject(new Error(`Google Maps Geocoder trả về trạng thái ${status}.`));
      },
    );
  });

  geocodeCache.set(cacheKey, promise);

  try {
    const result = await promise;
    geocodeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    geocodeCache.delete(cacheKey);
    throw error;
  }
}

export async function geocodeAddress(address) {
  const normalized = String(address ?? "").trim();
  if (!normalized) return null;

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized);
  }

  const maps = await loadGoogleMaps();
  const geocoder = new maps.Geocoder();

  const promise = new Promise((resolve, reject) => {
    geocoder.geocode(
      {
        address: normalized,
        region: "VN",
      },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          resolve({
            lat: location.lat(),
            lng: location.lng(),
            formattedAddress: results[0].formatted_address ?? normalized,
            placeId: results[0].place_id ?? null,
          });
          return;
        }

        if (status === "ZERO_RESULTS") {
          resolve(null);
          return;
        }

        reject(new Error(`Google Maps Geocoder trả về trạng thái ${status}.`));
      },
    );
  });

  geocodeCache.set(normalized, promise);

  try {
    const result = await promise;
    geocodeCache.set(normalized, result);
    return result;
  } catch (error) {
    geocodeCache.delete(normalized);
    throw error;
  }
}

export async function resolveHotelPosition(hotel) {
  // Hỗ trợ tọa độ do hệ thống tự sở hữu nếu sau này có nguồn dữ liệu riêng.
  const stored = hotelStoredPosition(hotel);
  if (stored) {
    return {
      ...stored,
      formattedAddress: buildHotelAddress(hotel),
      source: "stored",
    };
  }

  if (hotel?.googlePlaceId) {
    const byPlaceId = await geocodePlaceId(hotel.googlePlaceId);
    if (byPlaceId) return { ...byPlaceId, source: "place-id" };
  }

  const geocoded = await geocodeAddress(buildHotelAddress(hotel));
  return geocoded ? { ...geocoded, source: "geocoded" } : null;
}
