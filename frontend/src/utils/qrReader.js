const ZXING_SOURCES = [
  "https://unpkg.com/@zxing/browser@0.2.1",
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js",
];

const JSQR_SOURCES = [
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js",
];

let zxingPromise = null;
let jsQrPromise = null;

function hasZxing() {
  return Boolean(window.ZXingBrowser?.BrowserQRCodeReader);
}

function hasJsQr() {
  return typeof window.jsQR === "function";
}

function injectScript({ source, id, ready, errorMessage }) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);

    if (existing) {
      if (ready()) {
        resolve();
        return;
      }

      existing.addEventListener(
        "load",
        () => {
          if (ready()) resolve();
          else reject(new Error(errorMessage));
        },
        { once: true },
      );

      existing.addEventListener(
        "error",
        () => reject(new Error(errorMessage)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = source;
    script.async = true;
    script.crossOrigin = "anonymous";

    script.addEventListener(
      "load",
      () => {
        if (ready()) resolve();
        else {
          script.remove();
          reject(new Error(errorMessage));
        }
      },
      { once: true },
    );

    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error(errorMessage));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });
}

export async function loadZxingBrowser() {
  if (hasZxing()) return window.ZXingBrowser;
  if (zxingPromise) return zxingPromise;

  zxingPromise = (async () => {
    let lastError = null;

    for (let index = 0; index < ZXING_SOURCES.length; index += 1) {
      try {
        await injectScript({
          source: ZXING_SOURCES[index],
          id: `enziu-zxing-browser-${index}`,
          ready: hasZxing,
          errorMessage: "Không tải được thư viện ZXing.",
        });
        return window.ZXingBrowser;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Không tải được bộ đọc QR.");
  })();

  try {
    return await zxingPromise;
  } catch (error) {
    zxingPromise = null;
    throw error;
  }
}

async function loadJsQr() {
  if (hasJsQr()) return window.jsQR;
  if (jsQrPromise) return jsQrPromise;

  jsQrPromise = (async () => {
    let lastError = null;

    for (let index = 0; index < JSQR_SOURCES.length; index += 1) {
      try {
        await injectScript({
          source: JSQR_SOURCES[index],
          id: `enziu-jsqr-${index}`,
          ready: hasJsQr,
          errorMessage: "Không tải được thư viện jsQR.",
        });
        return window.jsQR;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Không tải được bộ đọc QR CCCD.");
  })();

  try {
    return await jsQrPromise;
  } catch (error) {
    jsQrPromise = null;
    throw error;
  }
}

export function getQrText(result) {
  return String(
    result?.getText?.()
      ?? result?.text
      ?? result?.rawValue
      ?? result?.data
      ?? "",
  ).trim();
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function canvasContext(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Không thể xử lý ảnh QR.");
  return context;
}

async function decodeCanvasWithJsQr(canvas) {
  try {
    const jsQR = await loadJsQr();
    const context = canvasContext(canvas);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: "attemptBoth" },
    );
    return getQrText(result);
  } catch {
    return "";
  }
}

async function decodeWithNativeBarcodeDetector(source) {
  if (!window.BarcodeDetector) return "";

  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats.includes("qr_code")) return "";
    }

    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(source);
    return String(codes?.[0]?.rawValue ?? "").trim();
  } catch {
    return "";
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể mở ảnh QR. Hãy chọn ảnh JPG, PNG hoặc WEBP hợp lệ."));
    };
    image.src = objectUrl;
  });
}

function createQrCanvas(image, { maxLongSide = 2200, minLongSide = 0 } = {}) {
  const originalWidth = image.naturalWidth || image.videoWidth || image.width;
  const originalHeight = image.naturalHeight || image.videoHeight || image.height;

  if (!originalWidth || !originalHeight) {
    throw new Error("Không xác định được kích thước ảnh QR.");
  }

  let scale = 1;
  const longSide = Math.max(originalWidth, originalHeight);

  if (longSide > maxLongSide) {
    scale = maxLongSide / longSide;
  } else if (minLongSide > 0 && longSide < minLongSide) {
    scale = Math.min(4, minLongSide / longSide);
  }

  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = createCanvas(width, height);
  const context = canvasContext(canvas);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = scale <= 1;
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function createFilteredCanvas(source, filter) {
  const canvas = createCanvas(source.width, source.height);
  const context = canvasContext(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = filter;
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return canvas;
}

function createOtsuCanvas(source) {
  const canvas = createCanvas(source.width, source.height);
  const context = canvasContext(canvas);
  context.drawImage(source, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const histogram = new Array(256).fill(0);

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299
        + data[index + 1] * 0.587
        + data[index + 2] * 0.114,
    );
    histogram[gray] += 1;
  }

  const total = canvas.width * canvas.height;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i += 1) {
    weightBackground += histogram[i];
    if (!weightBackground) continue;

    const weightForeground = total - weightBackground;
    if (!weightForeground) break;

    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const betweenVariance = weightBackground
      * weightForeground
      * (meanBackground - meanForeground) ** 2;

    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance;
      threshold = i;
    }
  }

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299
        + data[index + 1] * 0.587
        + data[index + 2] * 0.114,
    );
    const value = gray > threshold ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createCropCanvas(source, x, y, width, height, minimumLongSide = 1200) {
  const sx = Math.max(0, Math.round(source.width * x));
  const sy = Math.max(0, Math.round(source.height * y));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(source.width * width)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(source.height * height)));

  const longSide = Math.max(sw, sh);
  const scale = longSide < minimumLongSide
    ? Math.min(3, minimumLongSide / longSide)
    : 1;

  const targetWidth = Math.round(sw * scale);
  const targetHeight = Math.round(sh * scale);
  const canvas = createCanvas(targetWidth, targetHeight);
  const context = canvasContext(canvas);

  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return canvas;
}

function createDecodeCanvases(image) {
  const original = createQrCanvas(image, { maxLongSide: 2200 });
  const enlarged = createQrCanvas(image, { maxLongSide: 2200, minLongSide: 1000 });

  const candidates = [
    original,
    enlarged,
    createFilteredCanvas(enlarged, "grayscale(1) contrast(1.35)"),
    createFilteredCanvas(enlarged, "grayscale(1) contrast(1.7)"),
    createOtsuCanvas(enlarged),
  ];

  // Với ảnh nguyên CCCD, QR thường chỉ chiếm một vùng nhỏ.
  const crops = [
    [0.40, 0.00, 0.60, 0.72],
    [0.45, 0.00, 0.55, 1.00],
    [0.00, 0.00, 1.00, 0.65],
    [0.00, 0.00, 0.65, 0.75],
    [0.15, 0.05, 0.75, 0.82],
  ];

  for (const crop of crops) {
    const cropped = createCropCanvas(original, ...crop);
    candidates.push(cropped);
    candidates.push(createFilteredCanvas(cropped, "grayscale(1) contrast(1.55)"));
    candidates.push(createOtsuCanvas(cropped));
  }

  return candidates;
}

async function decodeCanvasCandidatesWithJsQr(canvases) {
  for (const canvas of canvases) {
    const text = await decodeCanvasWithJsQr(canvas);
    if (text) return text;
  }
  return "";
}

async function decodeCanvasCandidatesWithZxing(canvases) {
  try {
    const qrLibrary = await loadZxingBrowser();
    const reader = new qrLibrary.BrowserQRCodeReader();

    for (const canvas of canvases) {
      try {
        const result = reader.decodeFromCanvas(canvas);
        const text = getQrText(result);
        if (text) return text;
      } catch {
        // Thử candidate kế tiếp.
      }
    }
  } catch {
    // jsQR / BarcodeDetector vẫn có thể xử lý.
  }

  return "";
}

/**
 * Đọc QR từ ảnh.
 *
 * QR CCCD thường dày dữ liệu hơn QR check-in nên ZXing Browser có thể
 * nhận ra 3 finder-pattern nhưng vẫn không giải mã được. Vì vậy file này
 * dùng jsQR + nhiều bước tiền xử lý làm decoder chính cho CCCD, sau đó mới
 * fallback sang ZXing.
 */
export async function decodeQrImageFile(file) {
  if (!file) throw new Error("Bạn chưa chọn ảnh QR.");
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("File đã chọn không phải là ảnh.");
  }

  let nativeBitmap = null;
  if (typeof createImageBitmap === "function") {
    try {
      nativeBitmap = await createImageBitmap(file);
      const nativeText = await decodeWithNativeBarcodeDetector(nativeBitmap);
      if (nativeText) return nativeText;
    } catch {
      // Chuyển sang jsQR.
    } finally {
      nativeBitmap?.close?.();
    }
  }

  let objectUrl = null;

  try {
    const loaded = await loadImageFromFile(file);
    const image = loaded.image;
    objectUrl = loaded.objectUrl;
    const candidates = createDecodeCanvases(image);

    const jsQrText = await decodeCanvasCandidatesWithJsQr(candidates);
    if (jsQrText) return jsQrText;

    const zxingText = await decodeCanvasCandidatesWithZxing(candidates);
    if (zxingText) return zxingText;

    throw new Error(
      "Không giải mã được QR trong ảnh. Hãy chụp riêng vùng QR, giữ ảnh thẳng, đủ 4 góc và tránh lóa sáng.",
    );
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Decoder dành cho camera khi quét QR CCCD.
 * Booking QR vẫn có thể dùng ZXing stream như cũ; CCCD dùng jsQR theo frame
 * vì ổn định hơn với QR dày dữ liệu / ảnh hơi mờ.
 */
export async function decodeQrVideoElement(video) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return "";
  }

  const nativeText = await decodeWithNativeBarcodeDetector(video);
  if (nativeText) return nativeText;

  const canvas = createQrCanvas(video, { maxLongSide: 1280 });

  const candidates = [
    canvas,
    createFilteredCanvas(canvas, "grayscale(1) contrast(1.35)"),
  ];

  // Camera thường đặt QR vào giữa khung hình.
  const center = createCropCanvas(canvas, 0.12, 0.08, 0.76, 0.84, 1000);
  candidates.push(center);
  candidates.push(createFilteredCanvas(center, "grayscale(1) contrast(1.55)"));

  return decodeCanvasCandidatesWithJsQr(candidates);
}
