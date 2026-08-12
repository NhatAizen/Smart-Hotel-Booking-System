let leafletPromise = null;

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_SCRIPT = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_STYLE = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

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

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-enziu-leaflet="true"]')) {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = LEAFLET_STYLE;
      style.dataset.enziuLeaflet = "true";
      document.head.appendChild(style);
    }

    const existingScript = document.querySelector('script[data-enziu-leaflet="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.L), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Không thể tải thư viện Leaflet.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset.enziuLeaflet = "true";
    script.addEventListener(
      "load",
      () => {
        if (window.L?.map) resolve(window.L);
        else {
          leafletPromise = null;
          reject(new Error("Leaflet đã tải nhưng không khởi tạo được."));
        }
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        leafletPromise = null;
        reject(new Error("Không thể tải thư viện Leaflet."));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });

  return leafletPromise;
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
