const INTERNAL_MEDIA_PATHS = [
  "/api/users/media/",
  "/api/hotels/media/",
  "/api/reviews/media/",
];

function firstAvatarValue(source) {
  if (!source) return null;
  if (typeof source === "string") return source;

  return source.avatarUrl
    ?? source.avatar
    ?? source.picture
    ?? source.profileImage
    ?? null;
}

function internalAvatarPath(value) {
  const normalized = value.replaceAll("\\", "/");
  const lowerValue = normalized.toLowerCase();

  for (const mediaPath of INTERNAL_MEDIA_PATHS) {
    const index = lowerValue.indexOf(mediaPath);
    if (index >= 0) return normalized.slice(index);

    const withoutLeadingSlash = mediaPath.slice(1);
    if (lowerValue.startsWith(withoutLeadingSlash)) return `/${normalized}`;
  }

  return null;
}

/**
 * Resolve every internally uploaded avatar through the current origin.
 *
 * Older records can contain absolute development/container URLs. Returning the
 * `/api/.../media/...` path lets Vite's dev proxy and the production
 * Nginx/API Gateway route serve the same file without mixed-content failures.
 * External HTTPS identity-provider images (including Google) stay unchanged.
 */
export function resolveAvatarUrl(source) {
  const rawValue = firstAvatarValue(source);
  if (typeof rawValue !== "string") return null;

  const value = rawValue.trim();
  if (!value) return null;

  const sameOriginPath = internalAvatarPath(value);
  if (sameOriginPath) return sameOriginPath;

  if (value.startsWith("data:image/") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith("//")) {
    const protocol = typeof window !== "undefined" && window.location.protocol === "http:"
      ? "http:"
      : "https:";
    return `${protocol}${value}`;
  }

  try {
    const base = typeof window !== "undefined"
      ? window.location.origin
      : "https://example.invalid";
    const parsed = new URL(value, base);

    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    if (
      typeof window !== "undefined"
      && window.location.protocol === "https:"
      && parsed.protocol === "http:"
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}
