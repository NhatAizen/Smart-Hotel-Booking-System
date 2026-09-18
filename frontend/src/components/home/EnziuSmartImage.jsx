import { useState } from "react";

export default function EnziuSmartImage({
  src,
  alt = "",
  ratio = "4 / 3",
  position = "center",
  priority = false,
  className = "",
}) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(src) && !failed;

  return (
    <span
      className={`enziu-smart-image ${hasImage ? "has-image" : "is-empty"} ${className}`.trim()}
      style={{ "--enziu-image-ratio": ratio, "--enziu-image-position": position }}
    >
      {hasImage ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          draggable="false"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="enziu-smart-image-placeholder" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
