const ZXING_SOURCES = [
  "https://unpkg.com/@zxing/browser@0.2.1",
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js",
];

let zxingPromise = null;

function hasZxing() {
  return Boolean(window.ZXingBrowser?.BrowserQRCodeReader);
}

function injectScript(source, index) {
  return new Promise((resolve, reject) => {
    const scriptId = `enziu-zxing-browser-${index}`;
    const existing = document.getElementById(scriptId);

    if (existing) {
      if (hasZxing()) {
        resolve(window.ZXingBrowser);
        return;
      }

      existing.addEventListener(
        "load",
        () => {
          if (hasZxing()) {
            resolve(window.ZXingBrowser);
          } else {
            reject(
              new Error("Thư viện QR đã tải nhưng không khởi tạo được."),
            );
          }
        },
        { once: true },
      );

      existing.addEventListener(
        "error",
        () => {
          reject(new Error("Không tải được thư viện QR."));
        },
        { once: true },
      );

      return;
    }

    const script = document.createElement("script");

    script.id = scriptId;
    script.src = source;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.enziuQrLibrary = "true";

    script.addEventListener(
      "load",
      () => {
        if (hasZxing()) {
          resolve(window.ZXingBrowser);
        } else {
          reject(
            new Error("Thư viện QR đã tải nhưng không khởi tạo được."),
          );
        }
      },
      { once: true },
    );

    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error("Không tải được thư viện QR."));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });
}

export async function loadZxingBrowser() {
  if (hasZxing()) {
    return window.ZXingBrowser;
  }

  if (zxingPromise) {
    return zxingPromise;
  }

  zxingPromise = (async () => {
    let lastError = null;

    for (let index = 0; index < ZXING_SOURCES.length; index += 1) {
      try {
        return await injectScript(ZXING_SOURCES[index], index);
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ??
      new Error("Không tải được bộ đọc QR.")
    );
  })();

  try {
    return await zxingPromise;
  } catch (error) {
    zxingPromise = null;
    throw error;
  }
}

export function getQrText(result) {
  return String(
    result?.getText?.() ??
    result?.text ??
    "",
  ).trim();
}

/**
 * Load File thành HTMLImageElement thật.
 *
 * Quan trọng:
 * ZXing đôi khi báo:
 * "Dimensions could be not found"
 *
 * nếu decode blob URL trước khi trình duyệt load xong kích thước ảnh.
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        // Đảm bảo trình duyệt đã decode hoàn toàn ảnh.
        if (typeof image.decode === "function") {
          try {
            await image.decode();
          } catch {
            // onload đã thành công nên vẫn có thể tiếp tục.
          }
        }

        resolve({
          image,
          objectUrl,
        });
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error(
          "Không thể mở ảnh QR. Hãy chọn ảnh JPG, PNG hoặc WEBP hợp lệ.",
        ),
      );
    };

    image.src = objectUrl;
  });
}

/**
 * Tạo canvas từ ảnh.
 *
 * Canvas giúp ZXing xử lý ổn định hơn với:
 * - ảnh screenshot lớn
 * - ảnh điện thoại
 * - ảnh QR nằm giữa nhiều nội dung
 * - ảnh có kích thước rất lớn
 */
function createQrCanvas(image, maxSize = 1800) {
  const originalWidth =
    image.naturalWidth ||
    image.width;

  const originalHeight =
    image.naturalHeight ||
    image.height;

  if (!originalWidth || !originalHeight) {
    throw new Error("Không xác định được kích thước ảnh QR.");
  }

  let width = originalWidth;
  let height = originalHeight;

  if (width > maxSize || height > maxSize) {
    const scale = Math.min(
      maxSize / width,
      maxSize / height,
    );

    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Không thể xử lý ảnh QR.");
  }

  // Nền trắng để tránh vấn đề transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.drawImage(
    image,
    0,
    0,
    width,
    height,
  );

  return canvas;
}

/**
 * Decode QR từ File.
 *
 * Chiến lược:
 *
 * 1. Load ảnh thật.
 * 2. Thử decode HTMLImageElement.
 * 3. Nếu thất bại -> chuyển sang Canvas.
 * 4. Thử lại bằng Canvas.
 */
export async function decodeQrImageFile(file) {
  if (!file) {
    throw new Error("Bạn chưa chọn ảnh QR.");
  }

  if (
    file.type &&
    !file.type.startsWith("image/")
  ) {
    throw new Error("File đã chọn không phải là ảnh.");
  }

  const qrLibrary = await loadZxingBrowser();

  const reader =
    new qrLibrary.BrowserQRCodeReader();

  let objectUrl = null;

  try {
    const loaded =
      await loadImageFromFile(file);

    const image = loaded.image;
    objectUrl = loaded.objectUrl;

    /*
     * Cách 1:
     * Decode trực tiếp HTMLImageElement đã load xong.
     */
    try {
      const result =
        await reader.decodeFromImageElement(image);

      const text = getQrText(result);

      if (text) {
        return text;
      }
    } catch {
      // Chuyển sang fallback canvas.
    }

    /*
     * Cách 2:
     * Convert ảnh -> canvas.
     */
    const canvas =
      createQrCanvas(image);

    try {
      const result =
        await reader.decodeFromCanvas(canvas);

      const text = getQrText(result);

      if (text) {
        return text;
      }
    } catch {
      // Xử lý message ở dưới.
    }

    throw new Error(
      "Không tìm thấy mã QR trong ảnh. " +
      "Hãy dùng ảnh rõ, nhìn thấy đầy đủ 4 cạnh của mã QR và không bị cắt.",
    );
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    try {
      qrLibrary
        ?.BrowserCodeReader
        ?.releaseAllStreams?.();
    } catch {
      // Không ảnh hưởng quá trình đọc QR.
    }
  }
}